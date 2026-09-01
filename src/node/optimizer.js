import {
  MAX_INPUT_CHARS,
  MAX_OUTPUT_CHARS,
  boundedText,
  endpointCandidates,
  isPlainObject,
} from "./config.js";
import {
  validateSettingsForRequest,
  buildOptimizationPayload,
  buildClarificationPayload,
  extractResponseText,
  parseClarificationJson,
  requestStreamWithFiniteV1Fallback,
  requestWithFiniteV1Fallback,
} from "./provider.js";

export async function executeOptimization({
  fetchImpl,
  settings,
  packageVersion,
  text,
  clarifications = [],
  stream = true,
  signal,
  timeoutMs = 60_000,
  onChunk,
}) {
  const normalized = validateSettingsForRequest(settings);
  if (!normalized.enabled) {
    const error = new Error("提示词优化已关闭");
    error.code = "disabled";
    throw error;
  }
  const rawText = boundedText(typeof text === "string" ? text : "", MAX_INPUT_CHARS, "提示词");
  if (!rawText.trim()) {
    const error = new Error("当前 Composer 为空");
    error.code = "empty_input";
    throw error;
  }

  const useStreaming = normalized.streaming !== false && stream !== false;
  const body = buildOptimizationPayload({
    protocol: normalized.protocol,
    model: normalized.model,
    instruction: normalized.instruction,
    text: rawText,
    clarifications,
    stream: useStreaming,
  });

  const candidates = endpointCandidates(normalized.baseUrl, normalized.protocol);
  let rawResult = "";

  if (useStreaming) {
    rawResult = await requestStreamWithFiniteV1Fallback(
      {
        fetchImpl,
        protocol: normalized.protocol,
        apiKey: normalized.apiKey,
        packageVersion,
        body,
        signal,
        timeoutMs,
        onChunk,
      },
      candidates,
    );
  } else {
    const response = await requestWithFiniteV1Fallback(
      {
        fetchImpl,
        protocol: normalized.protocol,
        apiKey: normalized.apiKey,
        packageVersion,
        body,
        signal,
        timeoutMs,
      },
      candidates,
    );
    rawResult = extractResponseText(response);
  }

  const result = boundedText(rawResult.trim(), MAX_OUTPUT_CHARS, "优化结果");
  if (!result) {
    const error = new Error("API 返回了空结果");
    error.code = "empty_result";
    throw error;
  }

  return { result, streamed: useStreaming };
}

export async function executeClarification({
  fetchImpl,
  settings,
  packageVersion,
  text,
  clarifications = [],
  round = 1,
  signal,
  timeoutMs = 60_000,
}) {
  const normalized = validateSettingsForRequest(settings);
  const original = boundedText(typeof text === "string" ? text : "", MAX_INPUT_CHARS, "提示词");
  if (!original.trim()) {
    const error = new Error("当前 Composer 为空");
    error.code = "empty_input";
    throw error;
  }

  const body = buildClarificationPayload({
    protocol: normalized.protocol,
    model: normalized.model,
    original,
    clarifications,
    round,
  });

  const candidates = endpointCandidates(normalized.baseUrl, normalized.protocol);
  const response = await requestWithFiniteV1Fallback(
    {
      fetchImpl,
      protocol: normalized.protocol,
      apiKey: normalized.apiKey,
      packageVersion,
      body,
      signal,
      timeoutMs,
    },
    candidates,
  );

  const raw = extractResponseText(response);
  return parseClarificationJson(raw || (isPlainObject(response) ? JSON.stringify(response) : ""));
}
