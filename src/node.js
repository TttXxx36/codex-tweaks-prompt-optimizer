import { randomUUID } from "node:crypto";
import {
  SCHEMA_VERSION,
  MAX_INPUT_CHARS,
  MAX_OUTPUT_CHARS,
  MAX_RESPONSE_BYTES,
  REQUEST_TIMEOUT_MS,
  MODEL_OUTPUT_TOKENS,
  HISTORY_LIMITS,
  MODES,
  PROTOCOLS,
  DEFAULT_INSTRUCTION,
  DEFAULT_PROMPT_PRESETS,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  asTrimmedString,
  isPlainObject,
  normalizeSettings,
  normalizeProfile,
  normalizePreset,
  validateBaseUrl,
  endpointCandidates,
  modelsEndpointCandidates,
} from "./node/config.js";
import {
  StorageManager,
  readPackageVersion,
  redactSettings,
  sortHistoryEntries,
  trimHistory,
} from "./node/storage.js";
import {
  validateSettingsForRequest,
  buildOptimizationPayload,
  buildClarificationPayload,
  extractResponseText,
  extractStreamDelta,
  parseClarificationJson,
  parseJsonResponseBody,
  sanitizeError,
  testConnection as runTestConnection,
  fetchModels as runFetchModels,
} from "./node/provider.js";
import {
  executeOptimization,
  executeClarification,
} from "./node/optimizer.js";

// Re-export all public API symbols for complete backwards compatibility
export {
  SCHEMA_VERSION,
  MAX_INPUT_CHARS,
  MAX_OUTPUT_CHARS,
  MAX_RESPONSE_BYTES,
  REQUEST_TIMEOUT_MS,
  MODEL_OUTPUT_TOKENS,
  HISTORY_LIMITS,
  MODES,
  PROTOCOLS,
  DEFAULT_INSTRUCTION,
  DEFAULT_PROMPT_PRESETS,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  normalizeSettings,
  validateBaseUrl,
  endpointCandidates,
  modelsEndpointCandidates,
  buildOptimizationPayload,
  buildClarificationPayload,
  extractResponseText,
  extractStreamDelta,
  parseClarificationJson,
  parseJsonResponseBody,
  redactSettings,
  sortHistoryEntries,
  sanitizeError,
};

function ok(payload = {}) {
  return { status: "ok", ...payload };
}

function failure(error, secrets = [], operationId) {
  return {
    status: error?.code === "cancelled" ? "cancelled" : "failed",
    code: error?.code || (error?.name === "AbortError" ? "cancelled" : "request_failed"),
    message: sanitizeError(error, secrets),
    ...(operationId ? { operationId } : {}),
  };
}

export function createNodeRuntime({
  dataDirectory,
  packageDirectory,
  fetchImpl = globalThis.fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
  signal,
  rpc,
} = {}) {
  if (!dataDirectory) throw new Error("Node dataDirectory 未提供");

  const storage = new StorageManager(dataDirectory, packageDirectory);
  const packageVersion = readPackageVersion(packageDirectory);
  const operations = new Map();
  let disposed = false;

  const cancelOperation = (operationId) => {
    const key = asTrimmedString(operationId);
    const controller = operations.get(key);
    if (!controller) return false;
    controller.abort();
    return true;
  };

  const operation = async (payload, callback) => {
    const operationId = asTrimmedString(payload?.operationId) || randomUUID();
    if (payload?.cancel === true) {
      return ok({ operationId, cancelled: cancelOperation(operationId) });
    }
    if (disposed) {
      const error = new Error("功能包已停用");
      error.code = "disposed";
      return failure(error, [], operationId);
    }
    const controller = new AbortController();
    operations.set(operationId, controller);
    const abortFromParent = () => controller.abort();
    signal?.addEventListener("abort", abortFromParent, { once: true });
    try {
      return await callback(controller.signal, operationId);
    } catch (error) {
      const secrets = [];
      try {
        const current = await storage.readSettings();
        if (current.apiKey) secrets.push(current.apiKey);
      } catch {
        // Keep original error
      }
      return failure(error, secrets, operationId);
    } finally {
      operations.delete(operationId);
      signal?.removeEventListener("abort", abortFromParent);
    }
  };

  const loadSettings = async () => ok({ settings: redactSettings(await storage.readSettings()) });

  const saveSettings = async (payload = {}) => {
    const current = await storage.readSettings();
    const draft = isPlainObject(payload?.settings) ? payload.settings : payload;
    const next = normalizeSettings(draft, current);
    await storage.writeSettings(next);
    const history = await storage.readHistory();
    await storage.writeHistory(trimHistory(history, next.historyLimit));
    if (payload.historyRecord) {
      await storage.appendHistory(payload.historyRecord, next.historyLimit);
    }
    return ok({ settings: redactSettings(next) });
  };

  const clearApiKey = async () => {
    const next = await storage.clearApiKey();
    return ok({ settings: redactSettings(next) });
  };

  const listModels = async (payload = {}) => operation(payload, async (requestSignal, operationId) => {
    const saved = await storage.readSettings();
    const draft = isPlainObject(payload?.settings) ? payload.settings : payload;
    const settings = normalizeSettings(draft, saved);
    const version = await storage.getPackageVersion();
    const result = await runFetchModels({
      fetchImpl,
      settings,
      packageVersion: version,
      signal: requestSignal,
    });
    if (!result.models?.length) {
      const error = new Error("API 未返回可识别的模型列表，仍可手动填写模型名称");
      error.code = "models_unsupported";
      throw error;
    }
    return ok({ operationId, models: result.models });
  });

  const testConnection = async (payload = {}) => operation(payload, async (requestSignal, operationId) => {
    const saved = await storage.readSettings();
    const draft = isPlainObject(payload?.settings) ? payload.settings : payload;
    const settings = normalizeSettings(draft, saved);
    const version = await storage.getPackageVersion();
    await runTestConnection({
      fetchImpl,
      settings,
      packageVersion: version,
      signal: requestSignal,
    });
    return ok({ operationId, message: "连接成功", responseType: "json" });
  });

  const optimize = async (payload = {}) => operation(payload, async (requestSignal, operationId) => {
    const settings = await storage.readSettings();
    const version = await storage.getPackageVersion();
    const { result, streamed } = await executeOptimization({
      fetchImpl,
      settings,
      packageVersion: version,
      text: payload.text,
      clarifications: payload.clarifications,
      stream: payload.stream,
      signal: requestSignal,
      timeoutMs,
      onChunk: (delta, accumulated) => {
        if (rpc?.emit) {
          rpc.emit("optimizer-chunk", { operationId, delta, accumulated, isDone: false });
        }
        if (typeof payload.onChunk === "function") {
          payload.onChunk(delta, accumulated);
        }
      },
    });
    if (streamed && rpc?.emit) {
      rpc.emit("optimizer-chunk", { operationId, delta: "", accumulated: result, isDone: true });
    }
    return ok({ operationId, result, streamed });
  });

  const clarifyRound = async (payload = {}) => operation(payload, async (requestSignal, operationId) => {
    const settings = await storage.readSettings();
    const version = await storage.getPackageVersion();
    const parsed = await executeClarification({
      fetchImpl,
      settings,
      packageVersion: version,
      text: payload.text,
      clarifications: payload.clarifications,
      round: payload.round,
      signal: requestSignal,
      timeoutMs,
    });
    return ok({ operationId, ...parsed });
  });

  const listHistory = async () => {
    const settings = await storage.readSettings();
    const history = await storage.readHistory();
    return ok({ entries: trimHistory(history, settings.historyLimit).entries });
  };

  const deleteHistory = async (payload = {}) => {
    const id = asTrimmedString(payload.id);
    if (!id) {
      const error = new Error("缺少历史记录 ID");
      error.code = "invalid_history_id";
      return failure(error);
    }
    const nextHistory = await storage.deleteHistory(id);
    return ok({ deleted: true, count: nextHistory.entries.length });
  };

  const togglePinHistory = async (payload = {}) => {
    const id = asTrimmedString(payload.id);
    if (!id) {
      const error = new Error("缺少历史记录 ID");
      error.code = "invalid_history_id";
      return failure(error);
    }
    const history = await storage.readHistory();
    let isPinned = false;
    let found = false;
    const nextEntries = history.entries.map((entry) => {
      if (entry.id === id) {
        found = true;
        isPinned = payload.pin !== undefined ? Boolean(payload.pin) : !entry.isPinned;
        return { ...entry, isPinned };
      }
      return entry;
    });
    if (!found) {
      const error = new Error("未找到指定历史记录");
      error.code = "history_not_found";
      return failure(error);
    }
    const sorted = sortHistoryEntries(nextEntries);
    await storage.writeHistory({ schemaVersion: SCHEMA_VERSION, entries: sorted });
    return ok({ id, isPinned, entries: sorted });
  };

  const selectProfile = async (payload = {}) => {
    const profileId = asTrimmedString(payload.profileId || payload.id);
    const current = await storage.readSettings();
    const target = current.profiles.find((p) => p.id === profileId);
    if (!target) {
      const error = new Error("未找到指定配置档案");
      error.code = "profile_not_found";
      return failure(error);
    }
    const next = normalizeSettings({ activeProfileId: profileId }, current);
    await storage.writeSettings(next);
    return ok({ settings: redactSettings(next) });
  };

  const saveProfile = async (payload = {}) => {
    const profileData = isPlainObject(payload.profile) ? payload.profile : payload;
    const current = await storage.readSettings();
    const existingIndex = current.profiles.findIndex((p) => p.id === profileData.id);
    const updatedProfiles = [...current.profiles];
    if (existingIndex >= 0) {
      updatedProfiles[existingIndex] = normalizeProfile(profileData, current.profiles[existingIndex]);
    } else {
      updatedProfiles.push(normalizeProfile(profileData));
    }
    const next = normalizeSettings({ profiles: updatedProfiles }, current);
    await storage.writeSettings(next);
    return ok({ settings: redactSettings(next) });
  };

  const deleteProfile = async (payload = {}) => {
    const profileId = asTrimmedString(payload.profileId || payload.id);
    const current = await storage.readSettings();
    if (current.profiles.length <= 1) {
      const error = new Error("至少保留一个配置档案");
      error.code = "cannot_delete_last_profile";
      return failure(error);
    }
    const remaining = current.profiles.filter((p) => p.id !== profileId);
    if (remaining.length === current.profiles.length) {
      const error = new Error("未找到指定配置档案");
      error.code = "profile_not_found";
      return failure(error);
    }
    const activeProfileId = current.activeProfileId === profileId ? remaining[0].id : current.activeProfileId;
    const next = normalizeSettings({ profiles: remaining, activeProfileId }, current);
    await storage.writeSettings(next);
    return ok({ settings: redactSettings(next) });
  };

  const selectPreset = async (payload = {}) => {
    const presetId = asTrimmedString(payload.presetId || payload.id);
    const current = await storage.readSettings();
    const target = current.presets.find((p) => p.id === presetId);
    if (!target) {
      const error = new Error("未找到指定场景预设");
      error.code = "preset_not_found";
      return failure(error);
    }
    const next = normalizeSettings({ activePresetId: presetId, instruction: target.instruction }, current);
    await storage.writeSettings(next);
    return ok({ settings: redactSettings(next) });
  };

  const savePreset = async (payload = {}) => {
    const presetData = isPlainObject(payload.preset) ? payload.preset : payload;
    const current = await storage.readSettings();
    const existingIndex = current.presets.findIndex((p) => p.id === presetData.id);
    const updatedPresets = [...current.presets];
    if (existingIndex >= 0) {
      updatedPresets[existingIndex] = normalizePreset(presetData, current.presets[existingIndex]);
    } else {
      updatedPresets.push(normalizePreset(presetData));
    }
    const next = normalizeSettings({ presets: updatedPresets }, current);
    await storage.writeSettings(next);
    return ok({ settings: redactSettings(next) });
  };

  const deletePreset = async (payload = {}) => {
    const presetId = asTrimmedString(payload.presetId || payload.id);
    const current = await storage.readSettings();
    if (current.presets.length <= 1) {
      const error = new Error("至少保留一个场景预设");
      error.code = "cannot_delete_last_preset";
      return failure(error);
    }
    const remaining = current.presets.filter((p) => p.id !== presetId);
    const activePresetId = current.activePresetId === presetId ? remaining[0].id : current.activePresetId;
    const activePreset = remaining.find((p) => p.id === activePresetId) || remaining[0];
    const next = normalizeSettings({ presets: remaining, activePresetId, instruction: activePreset.instruction }, current);
    await storage.writeSettings(next);
    return ok({ settings: redactSettings(next) });
  };

  const clearHistory = async () => {
    await storage.clearHistory();
    return ok({ cleared: true });
  };

  const handlers = {
    "load-settings": loadSettings,
    "save-settings": saveSettings,
    "clear-api-key": clearApiKey,
    "test-connection": testConnection,
    "list-models": listModels,
    optimize,
    "clarify-round": clarifyRound,
    "list-history": listHistory,
    "delete-history": deleteHistory,
    "clear-history": clearHistory,
    "toggle-pin-history": togglePinHistory,
    "select-profile": selectProfile,
    "save-profile": saveProfile,
    "delete-profile": deleteProfile,
    "select-preset": selectPreset,
    "save-preset": savePreset,
    "delete-preset": deletePreset,
  };

  const invoke = async (method, payload = {}) => {
    const handler = handlers[method];
    if (!handler) {
      const error = new Error("未知的 Node RPC");
      error.code = "unknown_rpc";
      return failure(error);
    }
    try {
      return await handler(payload);
    } catch (error) {
      let secret = "";
      try {
        secret = (await storage.readSettings()).apiKey;
      } catch {
        // Keep error
      }
      return failure(error, secret ? [secret] : []);
    }
  };

  const dispose = () => {
    disposed = true;
    for (const controller of operations.values()) controller.abort();
    operations.clear();
  };
  signal?.addEventListener("abort", dispose, { once: true });

  return { handlers, invoke, dispose, cancelOperation };
}

export function activate({ rpc, packageDirectory, dataDirectory, signal } = {}) {
  if (!rpc || typeof rpc.handle !== "function") throw new Error("Node RPC 未提供");
  const runtime = createNodeRuntime({ packageDirectory, dataDirectory, signal, rpc });
  const registrations = [];
  for (const [method, handler] of Object.entries(runtime.handlers)) {
    const registration = rpc.handle(method, handler);
    if (typeof registration === "function") registrations.push(registration);
    else if (registration && typeof registration.dispose === "function") registrations.push(() => registration.dispose());
    else if (registration && typeof registration.unregister === "function") registrations.push(() => registration.unregister());
  }
  return {
    dispose: () => {
      runtime.dispose();
      for (const unregister of registrations.splice(0)) unregister();
    },
  };
}
