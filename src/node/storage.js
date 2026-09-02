import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  SCHEMA_VERSION,
  MAX_INPUT_CHARS,
  MAX_OUTPUT_CHARS,
  MODES,
  DEFAULT_SETTINGS,
  asTrimmedString,
  isPlainObject,
  boundedText,
  normalizeSettings,
} from "./config.js";

const CONFIG_FILE = "config.json";
const HISTORY_FILE = "history.json";
const PACKAGE_MANIFEST_FILE = "package.json";
export const UNKNOWN_PACKAGE_VERSION = "unknown";

export async function readPackageVersion(packageDirectory) {
  if (typeof packageDirectory !== "string" || !path.isAbsolute(packageDirectory)) return UNKNOWN_PACKAGE_VERSION;
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(packageDirectory, PACKAGE_MANIFEST_FILE), "utf8"));
    return asTrimmedString(manifest?.version, UNKNOWN_PACKAGE_VERSION);
  } catch {
    return UNKNOWN_PACKAGE_VERSION;
  }
}

export function redactSettings(settings) {
  const normalized = normalizeSettings(settings);
  return {
    schemaVersion: SCHEMA_VERSION,
    enabled: normalized.enabled,
    streaming: normalized.streaming,
    mode: normalized.mode,
    protocol: normalized.protocol,
    baseUrl: normalized.baseUrl,
    apiKeyConfigured: Boolean(normalized.apiKey),
    model: normalized.model,
    instruction: normalized.instruction,
    historyLimit: normalized.historyLimit,
    apiKey: "",
    activeProfileId: normalized.activeProfileId,
    profiles: normalized.profiles.map((p) => ({
      id: p.id,
      name: p.name,
      protocol: p.protocol,
      baseUrl: p.baseUrl,
      model: p.model,
      streaming: p.streaming,
      apiKeyConfigured: Boolean(p.apiKey),
      apiKey: "",
    })),
    activePresetId: normalized.activePresetId,
    presets: normalized.presets,
    previewFontSize: normalized.previewFontSize,
    enableShortcut: normalized.enableShortcut,
    previewSplitRatio: normalized.previewSplitRatio,
  };
}

export function defaultHistory() {
  return { schemaVersion: SCHEMA_VERSION, entries: [] };
}

export async function readJsonFile(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    const parseError = new Error("包数据文件损坏，请在设置页清理后重试");
    parseError.code = "data_file_invalid";
    throw parseError;
  }
}

export async function atomicWriteJson(filePath, value) {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  try {
    await fs.writeFile(temporaryPath, serialized, { encoding: "utf8", flag: "wx" });
    let retries = 10;
    while (retries > 0) {
      try {
        await fs.rename(temporaryPath, filePath);
        break;
      } catch (error) {
        if (!["EEXIST", "EPERM", "ENOTEMPTY", "EBUSY", "EACCES"].includes(error?.code)) throw error;
        retries--;
        if (retries === 0) {
          try {
            await fs.rm(filePath, { force: true });
            await fs.rename(temporaryPath, filePath);
          } catch {
            // fallback: direct copy if rename fails under severe locking
            await fs.writeFile(filePath, serialized, { encoding: "utf8" });
          }
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
    }
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
  }
}

function normalizeClarificationAnswer(item) {
  if (!isPlainObject(item)) return null;
  const question = boundedText(asTrimmedString(item.question), 4_000, "问题");
  const answer = boundedText(asTrimmedString(item.answer), 4_000, "回答");
  if (!question && !answer) return null;
  return { question, answer };
}

export function normalizeHistoryEntry(record) {
  if (!isPlainObject(record)) return null;
  const original = boundedText(record.original, MAX_INPUT_CHARS, "原始提示词");
  const result = boundedText(record.result, MAX_OUTPUT_CHARS, "优化结果");
  if (!original || !result) return null;
  const clarifications = Array.isArray(record.clarifications)
    ? record.clarifications.map(normalizeClarificationAnswer).filter(Boolean).slice(0, 9)
    : [];
  return {
    id: asTrimmedString(record.id) || randomUUID(),
    createdAt: asTrimmedString(record.createdAt) || new Date().toISOString(),
    original,
    result,
    clarifications,
    mode: MODES.includes(record.mode) ? record.mode : "direct",
    isPinned: Boolean(record.isPinned),
  };
}

export function normalizeHistoryFile(value) {
  if (!isPlainObject(value) || value.schemaVersion !== SCHEMA_VERSION || !Array.isArray(value.entries)) {
    return defaultHistory();
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    entries: value.entries.map(normalizeHistoryEntry).filter(Boolean).slice(0, 50),
  };
}

export function sortHistoryEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return [...entries].sort((a, b) => {
    const aPin = Boolean(a?.isPinned);
    const bPin = Boolean(b?.isPinned);
    if (aPin !== bPin) return aPin ? -1 : 1;
    const aTime = new Date(a?.createdAt || 0).getTime();
    const bTime = new Date(b?.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

export function trimHistory(history, limit) {
  if (!history || !Array.isArray(history.entries)) return defaultHistory();
  const sorted = sortHistoryEntries(history.entries);
  const pinned = sorted.filter((entry) => entry.isPinned);
  const unpinned = sorted.filter((entry) => !entry.isPinned);
  const keptUnpinned = limit === 0 ? [] : unpinned.slice(0, limit);
  const combined = [...pinned, ...keptUnpinned].slice(0, 50);
  return {
    schemaVersion: SCHEMA_VERSION,
    entries: limit === 0 && !pinned.length ? [] : combined,
  };
}

export class StorageManager {
  constructor(dataDirectory, packageDirectory) {
    this.dataDirectory = dataDirectory;
    this.packageDirectory = packageDirectory;
    this.configPath = dataDirectory ? path.join(dataDirectory, CONFIG_FILE) : null;
    this.historyPath = dataDirectory ? path.join(dataDirectory, HISTORY_FILE) : null;
    this.cachedPackageVersion = null;
    this.cachedSettings = null;
    this.cachedHistory = null;
  }

  async getPackageVersion() {
    if (this.cachedPackageVersion) return this.cachedPackageVersion;
    this.cachedPackageVersion = await readPackageVersion(this.packageDirectory);
    return this.cachedPackageVersion;
  }

  async readSettings() {
    if (this.cachedSettings) return this.cachedSettings;
    if (!this.configPath) {
      this.cachedSettings = { ...DEFAULT_SETTINGS };
      return this.cachedSettings;
    }
    const raw = await readJsonFile(this.configPath, DEFAULT_SETTINGS);
    this.cachedSettings = normalizeSettings(raw);
    return this.cachedSettings;
  }

  async writeSettings(settings) {
    const normalized = normalizeSettings(settings);
    this.cachedSettings = normalized;
    if (this.configPath) {
      await atomicWriteJson(this.configPath, normalized);
    }
    return normalized;
  }

  async readHistory() {
    if (this.cachedHistory) return this.cachedHistory;
    if (!this.historyPath) {
      this.cachedHistory = defaultHistory();
      return this.cachedHistory;
    }
    const raw = await readJsonFile(this.historyPath, defaultHistory());
    this.cachedHistory = normalizeHistoryFile(raw);
    return this.cachedHistory;
  }

  async writeHistory(history) {
    const normalized = normalizeHistoryFile(history);
    this.cachedHistory = normalized;
    if (this.historyPath) {
      await atomicWriteJson(this.historyPath, normalized);
    }
    return normalized;
  }

  async appendHistory(record, limit) {
    const entry = normalizeHistoryEntry(record);
    if (!entry) {
      const error = new Error("历史记录缺少必要字段");
      error.code = "invalid_history_record";
      throw error;
    }
    const current = await this.readHistory();
    const existingIndex = current.entries.findIndex((item) => item.id === entry.id);
    let nextEntries;
    if (existingIndex >= 0) {
      nextEntries = current.entries.map((item, index) => (index === existingIndex ? entry : item));
    } else {
      nextEntries = [entry, ...current.entries];
    }
    const trimmed = trimHistory({ schemaVersion: SCHEMA_VERSION, entries: nextEntries }, limit);
    await this.writeHistory(trimmed);
    return entry;
  }

  async deleteHistory(id) {
    const current = await this.readHistory();
    const nextEntries = current.entries.filter((entry) => entry.id !== id);
    const nextHistory = { schemaVersion: SCHEMA_VERSION, entries: nextEntries };
    await this.writeHistory(nextHistory);
    return nextHistory;
  }

  async clearHistory() {
    const empty = defaultHistory();
    await this.writeHistory(empty);
    return empty;
  }

  async clearApiKey() {
    const current = await this.readSettings();
    const updated = {
      ...current,
      apiKey: "",
      profiles: current.profiles.map((p) => (p.id === current.activeProfileId ? { ...p, apiKey: "" } : p)),
    };
    return await this.writeSettings(updated);
  }

  invalidateCache() {
    this.cachedSettings = null;
    this.cachedHistory = null;
    this.cachedPackageVersion = null;
  }
}
