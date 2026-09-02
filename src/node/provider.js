import {
  MAX_INPUT_CHARS,
  MAX_OUTPUT_CHARS,
  MAX_RESPONSE_BYTES,
  REQUEST_TIMEOUT_MS,
  MODEL_OUTPUT_TOKENS,
  DEFAULT_INSTRUCTION,
  CLARIFICATION_INSTRUCTION,
  asTrimmedString,
  isPlainObject,
  boundedText,
  normalizeSettings,
  validateBaseUrl,
  endpointCandidates,
  modelsEndpointCandidates,
} from "./config.js";
import { UNKNOWN_PACKAGE_VERSION } from "./storage.js";

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

export function buildOptimizationPayload({ protocol, model, instruction, text, clarifications = [], stream = false }) {
  const normalizedText = clarificationText(text, clarifications);
  const normalizedInstruction = boundedText(asTrimmedString(instruction, DEFAULT_INSTRUCTION), 16_000, "优化指令");
  const normalizedModel = boundedText(asTrimmedString(model), 512, "模型名称");
  const useStream = Boolean(stream);
  if (protocol === "openaiResponses") {
    return {
      model: normalizedModel,
      instructions: normalizedInstruction,
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: normalizedText }] }],
      max_output_tokens: MODEL_OUTPUT_TOKENS,
      stream: useStream,
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
      stream: useStream,
    };
  }
  if (protocol === "anthropicMessages") {
    return {
      model: normalizedModel,
      system: normalizedInstruction,
      messages: [{ role: "user", content: normalizedText }],
      max_tokens: MODEL_OUTPUT_TOKENS,
      stream: useStream,
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
  if (parsed.questions.length > 3) {
    const error = new Error("澄清响应的问题数量或格式无效，请重试");
    error.code = "invalid_clarification_questions";
    throw error;
  }
  const questions = parsed.questions.map((q) => {
    if (typeof q === "string" && q.trim()) {
      return boundedText(q.trim(), 4_000, "澄清问题");
    }
    if (isPlainObject(q) && typeof q.question === "string" && q.question.trim()) {
      const qText = boundedText(q.question.trim(), 4_000, "澄清问题");
      const isMulti = Boolean(q.isMultiSelect);
      const rawOptions = Array.isArray(q.options) ? q.options : [];
      const options = rawOptions.map((opt) => {
        if (typeof opt === "string" && opt.trim()) {
          const isRec = opt.startsWith("(推荐)") || opt.startsWith("(Recommended)");
          return { label: opt.trim(), description: "", recommended: isRec };
        }
        if (isPlainObject(opt) && typeof opt.label === "string" && opt.label.trim()) {
          return {
            label: opt.label.trim(),
            description: typeof opt.description === "string" ? opt.description.trim() : "",
            recommended: Boolean(opt.recommended) || opt.label.startsWith("(推荐)") || opt.label.startsWith("(Recommended)"),
          };
        }
        return null;
      }).filter(Boolean).slice(0, 6);
      return {
        question: qText,
        isMultiSelect: isMulti,
        options,
      };
    }
    const error = new Error("澄清响应的问题数量或格式无效，请重试");
    error.code = "invalid_clarification_questions";
    throw error;
  });

  if (!parsed.readyToGenerate && questions.length === 0) {
    const error = new Error("澄清响应在未就绪时必须包含问题，请重试");
    error.code = "invalid_clarification_questions";
    throw error;
  }
  const result = { questions, readyToGenerate: parsed.readyToGenerate };
  if (typeof parsed.prompt === "string" && parsed.prompt.trim()) {
    result.prompt = parsed.prompt.trim();
  }
  return result;
}

export function collectModelIds(body) {
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

export function sanitizeError(error, secrets = []) {
  let message = error instanceof Error ? error.message : String(error ?? "请求失败");
  for (const secret of secrets) {
    if (secret) message = message.split(secret).join("[已遮蔽]");
  }
  message = message.replace(/(authorization|x-api-key|api[-_ ]?key)\s*[:=]\s*[^,;\s]+/gi, "$1: [已遮蔽]");
  if (!message || message.length > 512) return "请求失败，请稍后重试";
  return message;
}

const SHARED_TEXT_DECODER = new TextDecoder("utf-8");

export async function readBoundedBody(response, maximumBytes) {
  const declaredLength = Number(response.headers?.get?.("content-length") ?? 0);
  if (declaredLength > maximumBytes) {
    const error = new Error("API 响应过大");
    error.code = "response_too_large";
    throw error;
  }
  if (!response?.body?.getReader) {
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
  } catch (error) {
    await reader.cancel?.().catch?.(() => {});
    throw error;
  } finally {
    reader.releaseLock?.();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return SHARED_TEXT_DECODER.decode(merged);
}

export function authHeaders(protocol, apiKey, packageVersion = UNKNOWN_PACKAGE_VERSION) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": `codex-tweaks-ct-prompt-optimizer/${packageVersion}`,
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

function isHtmlResponse(contentType) {
  return String(contentType ?? "").split(";", 1)[0].trim().toLowerCase() === "text/html";
}

export function parseApiResponseBody(raw, contentType = "") {
  const normalized = String(raw ?? "").replace(/^\uFEFF/, "").trim();
  if (!normalized) return {};
  try {
    return JSON.parse(normalized);
  } catch {
    try {
      const events = parseSseJsonEvents(normalized);
      if (events) return mergeKnownSseEvents(events);
    } catch {
      // Fall through to error
    }
    const error = new Error(isHtmlResponse(contentType) ? "API 地址返回了网页，而不是 API 响应" : "API 响应不是合法 JSON");
    error.code = isHtmlResponse(contentType) ? "html_response" : "invalid_response_json";
    throw error;
  }
}

export function parseJsonResponseBody(raw) {
  return parseApiResponseBody(raw);
}

export async function requestJson({ fetchImpl, url, protocol, apiKey, packageVersion = UNKNOWN_PACKAGE_VERSION, method = "POST", body, signal, timeoutMs = REQUEST_TIMEOUT_MS }) {
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
      headers: authHeaders(protocol, apiKey, await packageVersion),
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

export function extractStreamDelta(protocol, chunk) {
  if (!isPlainObject(chunk)) return "";
  if (chunk.type === "response.completed" && isPlainObject(chunk.response)) {
    const text = extractResponseText(chunk.response);
    if (text) return text;
  }
  if (protocol === "openaiChatCompletions") {
    const choice = chunk.choices?.[0];
    if (typeof choice?.delta?.content === "string") return choice.delta.content;
    if (Array.isArray(choice?.delta?.content)) return textFromContentArray(choice.delta.content);
    if (typeof choice?.message?.content === "string") return choice.message.content;
    if (Array.isArray(choice?.message?.content)) return textFromContentArray(choice.message.content);
    return "";
  }
  if (protocol === "anthropicMessages") {
    if (chunk.type === "content_block_delta" && typeof chunk.delta?.text === "string") {
      return chunk.delta.text;
    }
    if (typeof chunk.delta?.text === "string") return chunk.delta.text;
    if (Array.isArray(chunk.content)) return textFromContentArray(chunk.content);
    return "";
  }
  if (protocol === "openaiResponses") {
    if (typeof chunk.output_text_delta === "string") return chunk.output_text_delta;
    if (chunk.type === "response.output_text.delta" && typeof chunk.delta === "string") return chunk.delta;
    if (typeof chunk.output_text === "string") return chunk.output_text;
    if (typeof chunk.delta?.content === "string") return chunk.delta.content;
    if (Array.isArray(chunk.output)) return extractResponseText(chunk);
    return "";
  }
  return "";
}

export async function requestStream({
  fetchImpl,
  url,
  protocol,
  apiKey,
  packageVersion = UNKNOWN_PACKAGE_VERSION,
  body,
  signal,
  timeoutMs = REQUEST_TIMEOUT_MS,
  onChunk,
}) {
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
      method: "POST",
      headers: {
        ...authHeaders(protocol, apiKey, await packageVersion),
        Accept: "text/event-stream, application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      redirect: "error",
    });

    if (!response.ok) {
      const error = new Error(`API 请求失败（HTTP ${response.status}）`);
      error.code = response.status === 404 ? "http_404" : "http_error";
      throw error;
    }

    const contentType = response.headers?.get?.("content-type") || "";
    if (isHtmlResponse(contentType)) {
      const raw = await readBoundedBody(response, MAX_RESPONSE_BYTES);
      parseApiResponseBody(raw, contentType);
    }

    if (!contentType.includes("text/event-stream") && (contentType.includes("json") || !response.body?.getReader)) {
      const raw = await readBoundedBody(response, MAX_RESPONSE_BYTES);
      const parsed = parseApiResponseBody(raw, contentType);
      const text = extractResponseText(parsed).trim();
      if (text && onChunk) onChunk(text, text);
      return text;
    }

    const reader = response.body.getReader();
    let buffer = "";
    let dataLines = [];
    let accumulatedText = "";

    const processEvent = () => {
      if (dataLines.length === 0) return;
      const dataStr = dataLines.length === 1 ? dataLines[0].trim() : dataLines.join("\n").trim();
      dataLines = [];
      if (!dataStr || dataStr === "[DONE]") return;
      try {
        const parsed = JSON.parse(dataStr);
        const delta = extractStreamDelta(protocol, parsed);
        if (delta) {
          accumulatedText += delta;
          if (typeof onChunk === "function") {
            onChunk(delta, accumulatedText);
          }
        }
      } catch {
        // Tolerate malformed chunk
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += SHARED_TEXT_DECODER.decode(value, { stream: true });
        let newlineIdx;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          buffer = buffer.slice(newlineIdx + 1);
          if (!line.trim()) {
            processEvent();
            continue;
          }
          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).replace(/^ /, ""));
          }
        }
      }
      if (buffer.trim().startsWith("data:")) {
        dataLines.push(buffer.trim().slice(5).replace(/^ /, ""));
      }
      processEvent();
    } catch (err) {
      await reader.cancel?.().catch?.(() => {});
      throw err;
    } finally {
      reader.releaseLock?.();
    }

    const finalText = accumulatedText.trim();
    if (!finalText) {
      const error = new Error("API 未返回有效的流式响应内容");
      error.code = "empty_stream_response";
      throw error;
    }
    return finalText;
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

export async function requestStreamWithFiniteV1Fallback(options, candidates) {
  let lastError;
  for (let index = 0; index < candidates.length; index += 1) {
    try {
      return await requestStream({ ...options, url: candidates[index] });
    } catch (error) {
      lastError = error;
      const canUseV1Fallback = error?.code === "http_404" || error?.code === "html_response";
      if (!canUseV1Fallback || index === candidates.length - 1) throw error;
    }
  }
  throw lastError;
}

export async function requestWithFiniteV1Fallback(options, candidates) {
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

export async function testConnection({ fetchImpl, settings, packageVersion, signal }) {
  const normalized = validateSettingsForRequest(settings, { requireModel: false });
  const candidates = endpointCandidates(normalized.baseUrl, normalized.protocol);
  const testPayload = buildOptimizationPayload({
    protocol: normalized.protocol,
    model: normalized.model || "gpt-3.5-turbo",
    instruction: "test",
    text: "test",
    stream: false,
  });
  await requestWithFiniteV1Fallback(
    {
      fetchImpl,
      protocol: normalized.protocol,
      apiKey: normalized.apiKey,
      packageVersion,
      body: testPayload,
      signal,
      timeoutMs: 15_000,
    },
    candidates,
  );
  return { status: "ok", message: "连接成功" };
}

export async function fetchModels({ fetchImpl, settings, packageVersion, signal }) {
  const normalized = validateSettingsForRequest(settings, { requireModel: false });
  const candidates = modelsEndpointCandidates(normalized.baseUrl);
  const body = await requestWithFiniteV1Fallback(
    {
      fetchImpl,
      protocol: normalized.protocol,
      apiKey: normalized.apiKey,
      packageVersion,
      method: "GET",
      signal,
      timeoutMs: 15_000,
    },
    candidates,
  );
  const models = collectModelIds(body);
  return { status: "ok", models };
}
