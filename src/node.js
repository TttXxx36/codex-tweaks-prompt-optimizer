import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const SCHEMA_VERSION = 1;
export const MAX_INPUT_CHARS = 32_000;
export const MAX_OUTPUT_CHARS = 8_000;
export const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
export const REQUEST_TIMEOUT_MS = 60_000;
export const MODEL_OUTPUT_TOKENS = 2_048;
export const HISTORY_LIMITS = Object.freeze([0, 5, 10, 20, 50]);
export const MODES = Object.freeze(["direct", "preview", "clarify"]);
export const PROTOCOLS = Object.freeze([
  "openaiResponses",
  "openaiChatCompletions",
  "anthropicMessages",
]);

export const DEFAULT_INSTRUCTION = `你是一名专业的提示词优化专家。请在不改变原始意图的前提下，将用户提供的提示词改写得更清晰、具体、可执行、可验证。

要求：
1. 保留原始提示词的语言、事实、URL、代码、数字、专有名词和明确的输出格式约束。
2. 不要编造缺失事实；必要时使用清晰的占位符。
3. 只输出可以直接使用的优化后提示词，不要添加解释、前言、后记或外层代码围栏。
4. 不要读取或假设任何会话历史、文件、附件或项目上下文。`;

const CLARIFICATION_INSTRUCTION = `你是提示词澄清助手。你只能根据用户给出的原始提示词和已经明确填写的回答判断还缺少哪些必要信息。

你必须只输出一个合法 JSON 对象，不要 Markdown 代码围栏，不要解释，不要输出其他文字：
{"questions":["问题一"],"readyToGenerate":false}

规则：
1. questions 必须是字符串数组，最多 3 个问题；如果信息足够，返回空数组并将 readyToGenerate 设为 true。
2. 只提出完成任务真正需要的问题，不能索取会话历史、文件、附件或项目上下文。
3. 不要替用户臆造答案；用户可以留空、跳过或取消。
4. readyToGenerate 为 false 时至少提出一个简短、可回答的问题。`;

export const DEFAULT_SETTINGS = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  enabled: true,
  mode: "direct",
  protocol: "openaiResponses",
  baseUrl: "",
  apiKey: "",
  apiKeyConfigured: false,
  model: "",
  instruction: DEFAULT_INSTRUCTION,
  historyLimit: 10,
});

const CONFIG_FILE = "config.json";
const HISTORY_FILE = "history.json";
const PACKAGE_VERSION = "0.1.7";

function asTrimmedString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedText(value, maximum, label) {
  const text = typeof value === "string" ? value : "";
  if (text.length > maximum) {
    const error = new Error(`${label}超过允许长度`);
    error.code = "input_too_large";
    throw error;
  }
  return text;
}

export function normalizeSettings(input = {}, existing = DEFAULT_SETTINGS) {
  const source = isPlainObject(input) ? input : {};
  const previous = isPlainObject(existing) ? existing : DEFAULT_SETTINGS;
  const hasNewKey = typeof source.apiKey === "string" && source.apiKey.trim().length > 0;
  const clearKey = source.clearApiKey === true;
  const apiKey = clearKey
    ? ""
    : hasNewKey
      ? source.apiKey.trim()
      : asTrimmedString(previous.apiKey, "");
  const requestedLimit = Number(source.historyLimit ?? previous.historyLimit);
  const historyLimit = HISTORY_LIMITS.includes(requestedLimit)
    ? requestedLimit
    : DEFAULT_SETTINGS.historyLimit;

  return {
    schemaVersion: SCHEMA_VERSION,
    enabled: source.enabled === undefined ? Boolean(previous.enabled) : Boolean(source.enabled),
    mode: MODES.includes(source.mode) ? source.mode : MODES.includes(previous.mode) ? previous.mode : DEFAULT_SETTINGS.mode,
    protocol: PROTOCOLS.includes(source.protocol)
      ? source.protocol
      : PROTOCOLS.includes(previous.protocol)
        ? previous.protocol
        : DEFAULT_SETTINGS.protocol,
    baseUrl: asTrimmedString(source.baseUrl, asTrimmedString(previous.baseUrl)),
    apiKey,
    apiKeyConfigured: apiKey.length > 0,
    model: asTrimmedString(source.model, asTrimmedString(previous.model)),
    instruction: asTrimmedString(source.instruction, asTrimmedString(previous.instruction, DEFAULT_INSTRUCTION)) || DEFAULT_INSTRUCTION,
    historyLimit,
  };
}

export function redactSettings(settings) {
  const normalized = normalizeSettings(settings);
  return {
    schemaVersion: SCHEMA_VERSION,
    enabled: normalized.enabled,
    mode: normalized.mode,
    protocol: normalized.protocol,
    baseUrl: normalized.baseUrl,
    apiKeyConfigured: Boolean(normalized.apiKey),
    model: normalized.model,
    instruction: normalized.instruction,
    historyLimit: normalized.historyLimit,
    apiKey: "",
  };
}

export function validateBaseUrl(value) {
  const raw = asTrimmedString(value);
  if (!raw) {
    const error = new Error("请先填写 API 地址");
    error.code = "missing_base_url";
    throw error;
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    const error = new Error("API 地址不是合法 URL");
    error.code = "invalid_base_url";
    throw error;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    const error = new Error("API 地址必须使用 HTTPS；本机服务可使用 HTTP");
    error.code = "invalid_scheme";
    throw error;
  }
  if (parsed.username || parsed.password) {
    const error = new Error("API 地址不得包含用户名或密码");
    error.code = "url_credentials_forbidden";
    throw error;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (parsed.protocol === "http:" && !isLocal) {
    const error = new Error("远程 API 必须使用 HTTPS；HTTP 仅允许 localhost、127.0.0.1 或 ::1");
    error.code = "insecure_remote_url";
    throw error;
  }
  return parsed;
}

function removeTrailingSlashes(value) {
  return value.replace(/\/+$/, "");
}

function hasPathSuffix(value, suffix) {
  try {
    return new URL(value).pathname.replace(/\/+$/, "").endsWith(suffix);
  } catch {
    return false;
  }
}

function addPath(value, suffix) {
  return `${removeTrailingSlashes(value)}/${suffix.replace(/^\/+/, "")}`;
}

export function endpointFor(baseUrl, protocol) {
  const base = removeTrailingSlashes(asTrimmedString(baseUrl));
  if (!PROTOCOLS.includes(protocol)) {
    const error = new Error("不支持的 API 协议");
    error.code = "unsupported_protocol";
    throw error;
  }
  if (protocol === "openaiResponses") {
    return hasPathSuffix(base, "/responses") ? base : addPath(base, "responses");
  }
  if (protocol === "openaiChatCompletions") {
    return hasPathSuffix(base, "/chat/completions") ? base : addPath(base, "chat/completions");
  }
  if (hasPathSuffix(base, "/v1/messages") || hasPathSuffix(base, "/messages")) {
    return base;
  }
  if (hasPathSuffix(base, "/v1")) {
    return addPath(base, "messages");
  }
  return addPath(base, "v1/messages");
}

export function endpointCandidates(baseUrl, protocol) {
  const primary = endpointFor(baseUrl, protocol);
  const parsed = new URL(primary);
  const pathname = parsed.pathname.replace(/\/+$/, "");
  if (pathname.split("/").includes("v1")) {
    return [primary];
  }
  const suffix = protocol === "openaiResponses" ? "/responses" : "/chat/completions";
  const root = pathname.endsWith(suffix) ? pathname.slice(0, -suffix.length) : pathname;
  parsed.pathname = `${root}/v1${suffix}`;
  return [primary, parsed.toString().replace(/\/$/, "")];
}

function apiRoot(baseUrl) {
  const base = removeTrailingSlashes(asTrimmedString(baseUrl));
  const suffixes = ["/chat/completions", "/responses", "/v1/messages", "/messages", "/models"];
  for (const suffix of suffixes) {
    if (hasPathSuffix(base, suffix)) {
      return base.slice(0, -suffix.length);
    }
  }
  return base;
}

export function modelsEndpointCandidates(baseUrl) {
  const root = apiRoot(baseUrl);
  if (hasPathSuffix(root, "/v1")) {
    return [addPath(root, "models")];
  }
  return [addPath(root, "models"), addPath(root, "v1/models")];
}

export function validateSettingsForRequest(settings, { requireModel = true } = {}) {
  const normalized = normalizeSettings(settings);
  validateBaseUrl(normalized.baseUrl);
  if (!normalized.apiKey) {
    const error = new Error("尚未配置 API Key");
    error.code = "missing_api_key";
    throw error;
  }
  if (requireModel && !normalized.model) {
    const error = new Error("请先填写模型名称");
    error.code = "missing_model";
    throw error;
  }
  return normalized;
}

function normalizeClarificationAnswer(item) {
  if (!isPlainObject(item)) return null;
  const question = boundedText(asTrimmedString(item.question), 4_000, "问题");
  const answer = boundedText(asTrimmedString(item.answer), 4_000, "回答");
  if (!question && !answer) return null;
  return { question, answer };
}

function clarificationText(original, clarifications = []) {
  const source = boundedText(original, MAX_INPUT_CHARS, "原始提示词");
  const answers = Array.isArray(clarifications)
    ? clarifications.map(normalizeClarificationAnswer).filter(Boolean).slice(0, 9)
    : [];
  const answerText = answers.length
    ? answers.map((item, index) => `问题 ${index + 1}：${item.question}\n回答 ${index + 1}：${item.answer || "（用户留空或跳过）"}`).join("\n\n")
    : "（尚无澄清回答）";
  return `【原始提示词开始】\n${source}\n【原始提示词结束】\n\n【用户明确填写的澄清回答开始】\n${answerText}\n【用户明确填写的澄清回答结束】`;
}

export function buildOptimizationPayload({ protocol, model, instruction, text, clarifications = [] }) {
  const normalizedText = clarificationText(text, clarifications);
  const normalizedInstruction = boundedText(asTrimmedString(instruction, DEFAULT_INSTRUCTION), 16_000, "优化指令");
  const normalizedModel = boundedText(asTrimmedString(model), 512, "模型名称");
  if (protocol === "openaiResponses") {
    return {
      model: normalizedModel,
      instructions: normalizedInstruction,
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: normalizedText }] }],
      max_output_tokens: MODEL_OUTPUT_TOKENS,
      stream: false,
    };
  }
  if (protocol === "openaiChatCompletions") {
    return {
      model: normalizedModel,
      messages: [
        { role: "system", content: normalizedInstruction },
        { role: "user", content: normalizedText },
      ],
      max_tokens: MODEL_OUTPUT_TOKENS,
      stream: false,
    };
  }
  if (protocol === "anthropicMessages") {
    return {
      model: normalizedModel,
      system: normalizedInstruction,
      messages: [{ role: "user", content: normalizedText }],
      max_tokens: MODEL_OUTPUT_TOKENS,
      stream: false,
    };
  }
  const error = new Error("不支持的 API 协议");
  error.code = "unsupported_protocol";
  throw error;
}

export function buildClarificationPayload({ protocol, model, original, clarifications = [], round = 1 }) {
  const normalizedRound = Number.isInteger(round) ? Math.min(3, Math.max(1, round)) : 1;
  const userText = `这是第 ${normalizedRound} 轮澄清。请判断是否还需要提问。\n\n${clarificationText(original, clarifications)}`;
  if (protocol === "openaiResponses") {
    return {
      model: asTrimmedString(model),
      instructions: CLARIFICATION_INSTRUCTION,
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: userText }] }],
      max_output_tokens: MODEL_OUTPUT_TOKENS,
      stream: false,
    };
  }
  if (protocol === "openaiChatCompletions") {
    return {
      model: asTrimmedString(model),
      messages: [
        { role: "system", content: CLARIFICATION_INSTRUCTION },
        { role: "user", content: userText },
      ],
      max_tokens: MODEL_OUTPUT_TOKENS,
      stream: false,
    };
  }
  if (protocol === "anthropicMessages") {
    return {
      model: asTrimmedString(model),
      system: CLARIFICATION_INSTRUCTION,
      messages: [{ role: "user", content: userText }],
      max_tokens: MODEL_OUTPUT_TOKENS,
      stream: false,
    };
  }
  const error = new Error("不支持的 API 协议");
  error.code = "unsupported_protocol";
  throw error;
}

function textFromContentArray(content) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((item) => isPlainObject(item) && typeof item.text === "string" && ["text", "output_text", "input_text"].includes(item.type ?? "text"))
    .map((item) => item.text)
    .join("\n");
}

export function extractResponseText(body) {
  if (!isPlainObject(body)) return "";
  if (typeof body.output_text === "string") return body.output_text;
  if (isPlainObject(body.response) && body.response !== body) {
    const nested = extractResponseText(body.response);
    if (nested) return nested;
  }
  if (Array.isArray(body.output)) {
    const output = body.output.map((item) => textFromContentArray(item?.content)).filter(Boolean).join("\n");
    if (output) return output;
  }
  if (Array.isArray(body.choices) && isPlainObject(body.choices[0])) {
    const message = body.choices[0].message;
    if (typeof message?.content === "string") return message.content;
    const content = textFromContentArray(message?.content);
    if (content) return content;
  }
  const anthropicContent = textFromContentArray(body.content);
  if (anthropicContent) return anthropicContent;
  if (typeof body.text === "string") return body.text;
  return "";
}

export function parseClarificationJson(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    const error = new Error("澄清响应不是合法 JSON，请重试");
    error.code = "invalid_clarification_json";
    throw error;
  }
  if (!isPlainObject(parsed) || !Array.isArray(parsed.questions) || typeof parsed.readyToGenerate !== "boolean") {
    const error = new Error("澄清响应缺少约定字段，请重试");
    error.code = "invalid_clarification_shape";
    throw error;
  }
  if (parsed.questions.length > 3 || parsed.questions.some((question) => typeof question !== "string" || !question.trim())) {
    const error = new Error("澄清响应的问题数量或格式无效，请重试");
    error.code = "invalid_clarification_questions";
    throw error;
  }
  const questions = parsed.questions.map((question) => boundedText(question.trim(), 4_000, "澄清问题"));
  if (!parsed.readyToGenerate && questions.length === 0) {
    const error = new Error("澄清响应在未就绪时必须包含问题，请重试");
    error.code = "invalid_clarification_questions";
    throw error;
  }
  return { questions, readyToGenerate: parsed.readyToGenerate };
}

function collectModelIds(body) {
  const candidates = [];
  if (Array.isArray(body?.data)) candidates.push(...body.data);
  if (Array.isArray(body?.models)) candidates.push(...body.models);
  if (Array.isArray(body?.items)) candidates.push(...body.items);
  const ids = candidates.map((item) => {
    if (typeof item === "string") return item;
    if (isPlainObject(item) && typeof item.id === "string") return item.id;
    if (isPlainObject(item) && typeof item.name === "string") return item.name;
    return "";
  });
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(0, 2_000).map((id) => id.slice(0, 512));
}

function classifyError(error) {
  if (error?.code) return error.code;
  if (error?.name === "AbortError") return "cancelled";
  return "request_failed";
}

export function sanitizeError(error, secrets = []) {
  let message = error instanceof Error ? error.message : String(error ?? "请求失败");
  for (const secret of secrets) {
    if (secret) message = message.split(secret).join("[已遮蔽]");
  }
  message = message.replace(/(authorization|x-api-key|api[-_ ]?key)\s*[:=]\s*[^,;\s]+/gi, "$1: [已遮蔽]");
  if (!message || message.length > 512) return "请求失败，请稍后重试";
  return message;
}

async function readBoundedBody(response, maximumBytes) {
  const declaredLength = Number(response.headers?.get?.("content-length") ?? 0);
  if (declaredLength > maximumBytes) {
    const error = new Error("API 响应过大");
    error.code = "response_too_large";
    throw error;
  }
  if (!response.body?.getReader) {
    const value = await response.text();
    if (Buffer.byteLength(value, "utf8") > maximumBytes) {
      const error = new Error("API 响应过大");
      error.code = "response_too_large";
      throw error;
    }
    return value;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        const error = new Error("API 响应过大");
        error.code = "response_too_large";
        throw error;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function authHeaders(protocol, apiKey) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": `codex-tweaks-ct-prompt-optimizer/${PACKAGE_VERSION}`,
  };
  if (protocol === "anthropicMessages") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function mergeKnownSseEvents(events) {
  let responsesText = "";
  let chatText = "";
  let anthropicText = "";
  let completedResponseText = "";
  const modelItems = [];

  for (const event of events) {
    if (!isPlainObject(event)) continue;
    if (typeof event.output_text === "string") responsesText += event.output_text;
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") responsesText += event.delta;
    if (event.type === "response.output_text.done" && typeof event.text === "string") responsesText = event.text;
    if (event.type === "response.completed" && isPlainObject(event.response)) {
      completedResponseText = extractResponseText(event.response) || completedResponseText;
    }
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && typeof event.delta.text === "string") {
      anthropicText += event.delta.text;
    }
    if (Array.isArray(event.choices)) {
      for (const choice of event.choices) {
        if (typeof choice?.delta?.content === "string") chatText += choice.delta.content;
        else if (typeof choice?.message?.content === "string") chatText += choice.message.content;
        else {
          const content = textFromContentArray(choice?.delta?.content ?? choice?.message?.content);
          if (content) chatText += content;
        }
      }
    }
    if (Array.isArray(event.data)) modelItems.push(...event.data);
    if (Array.isArray(event.models)) modelItems.push(...event.models);
  }

  if (completedResponseText) return { output_text: completedResponseText };
  if (responsesText) return { output_text: responsesText };
  if (chatText) return { choices: [{ message: { content: chatText } }] };
  if (anthropicText) return { content: [{ type: "text", text: anthropicText }] };
  if (modelItems.length) return { data: modelItems };
  if (events.length === 1) return events[0];
  return events.at(-1) ?? {};
}

function parseSseJsonEvents(raw) {
  const blocks = [];
  let dataLines = [];
  const flush = () => {
    const value = dataLines.join("\n").trim();
    dataLines = [];
    if (value && value !== "[DONE]") blocks.push(value);
  };

  for (const line of raw.split(/\r?\n/)) {
    if (!line) {
      flush();
      continue;
    }
    if (!line.startsWith("data:")) continue;
    const value = line.slice(5).replace(/^ /, "");
    if (value.trim() === "[DONE]") flush();
    else dataLines.push(value);
  }
  flush();
  if (!blocks.length) return null;

  try {
    return blocks.map((value) => JSON.parse(value));
  } catch {
    const lines = raw.split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter((value) => value && value !== "[DONE]");
    return lines.map((value) => JSON.parse(value));
  }
}

export function parseJsonResponseBody(raw) {
  return parseApiResponseBody(raw);
}

function isHtmlResponse(contentType) {
  return String(contentType ?? "").split(";", 1)[0].trim().toLowerCase() === "text/html";
}

function parseApiResponseBody(raw, contentType = "") {
  const normalized = String(raw ?? "").replace(/^\uFEFF/, "").trim();
  if (!normalized) return {};
  try {
    return JSON.parse(normalized);
  } catch {
    try {
      const events = parseSseJsonEvents(normalized);
      if (events) return mergeKnownSseEvents(events);
    } catch {
      // Fall through to the same safe error used for all unknown response bodies.
    }
    const error = new Error(isHtmlResponse(contentType) ? "API 地址返回了网页，而不是 API 响应" : "API 响应不是合法 JSON");
    error.code = isHtmlResponse(contentType) ? "html_response" : "invalid_response_json";
    throw error;
  }
}

async function requestJson({ fetchImpl, url, protocol, apiKey, method = "POST", body, signal, timeoutMs = REQUEST_TIMEOUT_MS }) {
  if (typeof fetchImpl !== "function") {
    const error = new Error("当前 Node 运行时不支持 fetch");
    error.code = "fetch_unavailable";
    throw error;
  }
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method,
      headers: authHeaders(protocol, apiKey),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      redirect: "error",
    });
    const raw = await readBoundedBody(response, MAX_RESPONSE_BYTES);
    if (!response.ok) {
      const error = new Error(`API 请求失败（HTTP ${response.status}）`);
      error.code = response.status === 404 ? "http_404" : "http_error";
      throw error;
    }
    return parseApiResponseBody(raw, response.headers?.get?.("content-type"));
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error("请求超时，请稍后重试");
      timeoutError.code = "timeout";
      throw timeoutError;
    }
    if (signal?.aborted || error?.name === "AbortError") {
      const cancelled = new Error("请求已取消");
      cancelled.code = "cancelled";
      throw cancelled;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

async function requestWithFiniteV1Fallback(options, candidates) {
  let lastError;
  for (let index = 0; index < candidates.length; index += 1) {
    try {
      return await requestJson({ ...options, url: candidates[index] });
    } catch (error) {
      lastError = error;
      const canUseV1Fallback = error?.code === "http_404" || error?.code === "html_response";
      if (!canUseV1Fallback || index === candidates.length - 1) throw error;
    }
  }
  throw lastError;
}

function defaultHistory() {
  return { schemaVersion: SCHEMA_VERSION, entries: [] };
}

function defaultConfig() {
  return { ...DEFAULT_SETTINGS };
}

async function readJsonFile(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    const parseError = new Error("包数据文件损坏，请在设置页清理后重试");
    parseError.code = "data_file_invalid";
    throw parseError;
  }
}

async function atomicWriteJson(filePath, value) {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  try {
    await fs.writeFile(temporaryPath, serialized, { encoding: "utf8", flag: "wx" });
    try {
      await fs.rename(temporaryPath, filePath);
    } catch (error) {
      if (!["EEXIST", "EPERM", "ENOTEMPTY"].includes(error?.code)) throw error;
      await fs.rm(filePath, { force: true });
      await fs.rename(temporaryPath, filePath);
    }
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
  }
}

function normalizeHistoryEntry(record) {
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
  };
}

function normalizeHistoryFile(value) {
  if (!isPlainObject(value) || value.schemaVersion !== SCHEMA_VERSION || !Array.isArray(value.entries)) {
    return defaultHistory();
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    entries: value.entries.map(normalizeHistoryEntry).filter(Boolean).slice(0, 50),
  };
}

function trimHistory(history, limit) {
  return {
    schemaVersion: SCHEMA_VERSION,
    entries: limit === 0 ? [] : history.entries.slice(0, limit),
  };
}

function settingsFromDraft(payload, saved) {
  const draft = isPlainObject(payload?.settings) ? payload.settings : payload;
  return normalizeSettings(draft, saved);
}

function ok(payload = {}) {
  return { status: "ok", ...payload };
}

function failure(error, secrets = [], operationId) {
  return {
    status: error?.code === "cancelled" ? "cancelled" : "failed",
    code: classifyError(error),
    message: sanitizeError(error, secrets),
    ...(operationId ? { operationId } : {}),
  };
}

export function createNodeRuntime({ dataDirectory, fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS, now = () => new Date().toISOString(), signal } = {}) {
  if (!dataDirectory) throw new Error("Node dataDirectory 未提供");
  const operations = new Map();
  let disposed = false;

  const configPath = path.join(dataDirectory, CONFIG_FILE);
  const historyPath = path.join(dataDirectory, HISTORY_FILE);

  const readConfig = async () => normalizeSettings(await readJsonFile(configPath, defaultConfig()));
  const readHistory = async () => normalizeHistoryFile(await readJsonFile(historyPath, defaultHistory()));

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
        const current = await readConfig();
        if (current.apiKey) secrets.push(current.apiKey);
      } catch {
        // Do not replace the original, already-sanitized failure with a config error.
      }
      return failure(error, secrets, operationId);
    } finally {
      operations.delete(operationId);
      signal?.removeEventListener("abort", abortFromParent);
    }
  };

  const saveHistoryRecord = async (record, settings) => {
    const normalized = normalizeHistoryEntry(record);
    if (!normalized) {
      const error = new Error("历史记录缺少原文或结果");
      error.code = "invalid_history_record";
      throw error;
    }
    const history = await readHistory();
    const next = trimHistory({ schemaVersion: SCHEMA_VERSION, entries: [normalized, ...history.entries] }, settings.historyLimit);
    await atomicWriteJson(historyPath, next);
    return normalized;
  };

  const saveSettings = async (payload = {}) => {
    const current = await readConfig();
    const next = settingsFromDraft(payload, current);
    // Saving an empty draft key preserves the stored key. clearApiKey is the explicit deletion path.
    await atomicWriteJson(configPath, next);
    const history = await readHistory();
    await atomicWriteJson(historyPath, trimHistory(history, next.historyLimit));
    if (payload.historyRecord) await saveHistoryRecord(payload.historyRecord, next);
    return ok({ settings: redactSettings(next) });
  };

  const loadSettings = async () => ok({ settings: redactSettings(await readConfig()) });

  const clearApiKey = async () => {
    const current = await readConfig();
    const next = normalizeSettings({ clearApiKey: true }, current);
    await atomicWriteJson(configPath, next);
    return ok({ settings: redactSettings(next) });
  };

  const listModels = async (payload = {}) => operation(payload, async (requestSignal, operationId) => {
    const saved = await readConfig();
    const settings = validateSettingsForRequest(settingsFromDraft(payload, saved), { requireModel: false });
    const candidates = modelsEndpointCandidates(settings.baseUrl);
    const body = await requestWithFiniteV1Fallback({
      fetchImpl,
      protocol: settings.protocol,
      apiKey: settings.apiKey,
      method: "GET",
      signal: requestSignal,
      timeoutMs,
    }, candidates);
    const models = collectModelIds(body);
    if (!models.length) {
      const error = new Error("API 未返回可识别的模型列表，仍可手动填写模型名称");
      error.code = "models_unsupported";
      throw error;
    }
    return ok({ operationId, models });
  });

  const testConnection = async (payload = {}) => operation(payload, async (requestSignal, operationId) => {
    const saved = await readConfig();
    const settings = validateSettingsForRequest(settingsFromDraft(payload, saved));
    const body = buildOptimizationPayload({
      protocol: settings.protocol,
      model: settings.model,
      instruction: "只回复 OK。",
      text: "连接测试。",
    });
    const candidates = endpointCandidates(settings.baseUrl, settings.protocol);
    const response = await requestWithFiniteV1Fallback({
      fetchImpl,
      protocol: settings.protocol,
      apiKey: settings.apiKey,
      body,
      signal: requestSignal,
      timeoutMs,
    }, candidates);
    return ok({ operationId, message: "连接成功", responseType: extractResponseText(response) ? "text" : "json" });
  });

  const optimize = async (payload = {}) => operation(payload, async (requestSignal, operationId) => {
    const saved = await readConfig();
    const settings = validateSettingsForRequest(saved);
    if (!settings.enabled) {
      const error = new Error("提示词优化已关闭");
      error.code = "disabled";
      throw error;
    }
    const text = boundedText(typeof payload.text === "string" ? payload.text : "", MAX_INPUT_CHARS, "提示词");
    if (!text.trim()) {
      const error = new Error("当前 Composer 为空");
      error.code = "empty_input";
      throw error;
    }
    const clarifications = Array.isArray(payload.clarifications) ? payload.clarifications : [];
    const body = buildOptimizationPayload({
      protocol: settings.protocol,
      model: settings.model,
      instruction: settings.instruction,
      text,
      clarifications,
    });
    const response = await requestWithFiniteV1Fallback({
      fetchImpl,
      protocol: settings.protocol,
      apiKey: settings.apiKey,
      body,
      signal: requestSignal,
      timeoutMs,
    }, endpointCandidates(settings.baseUrl, settings.protocol));
    const result = boundedText(extractResponseText(response).trim(), MAX_OUTPUT_CHARS, "优化结果");
    if (!result) {
      const error = new Error("API 返回了空结果");
      error.code = "empty_result";
      throw error;
    }
    return ok({ operationId, result });
  });

  const clarifyRound = async (payload = {}) => operation(payload, async (requestSignal, operationId) => {
    const saved = await readConfig();
    const settings = validateSettingsForRequest(saved);
    const original = boundedText(typeof payload.text === "string" ? payload.text : "", MAX_INPUT_CHARS, "提示词");
    if (!original.trim()) {
      const error = new Error("当前 Composer 为空");
      error.code = "empty_input";
      throw error;
    }
    const body = buildClarificationPayload({
      protocol: settings.protocol,
      model: settings.model,
      original,
      clarifications: Array.isArray(payload.clarifications) ? payload.clarifications : [],
      round: payload.round,
    });
    const response = await requestWithFiniteV1Fallback({
      fetchImpl,
      protocol: settings.protocol,
      apiKey: settings.apiKey,
      body,
      signal: requestSignal,
      timeoutMs,
    }, endpointCandidates(settings.baseUrl, settings.protocol));
    const raw = extractResponseText(response);
    const parsed = parseClarificationJson(raw || (isPlainObject(response) ? JSON.stringify(response) : ""));
    return ok({ operationId, ...parsed });
  });

  const listHistory = async () => {
    const settings = await readConfig();
    const history = await readHistory();
    return ok({ entries: trimHistory(history, settings.historyLimit).entries });
  };

  const deleteHistory = async (payload = {}) => {
    const id = asTrimmedString(payload.id);
    if (!id) {
      const error = new Error("缺少历史记录 ID");
      error.code = "invalid_history_id";
      return failure(error);
    }
    const history = await readHistory();
    const next = { schemaVersion: SCHEMA_VERSION, entries: history.entries.filter((entry) => entry.id !== id) };
    await atomicWriteJson(historyPath, next);
    return ok({ deleted: history.entries.length !== next.entries.length });
  };

  const clearHistory = async () => {
    await atomicWriteJson(historyPath, defaultHistory());
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
        secret = (await readConfig()).apiKey;
      } catch {
        // Keep the original error if config cannot be read.
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

export function activate({ rpc, dataDirectory, signal } = {}) {
  if (!rpc || typeof rpc.handle !== "function") throw new Error("Node RPC 未提供");
  const runtime = createNodeRuntime({ dataDirectory, signal });
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
