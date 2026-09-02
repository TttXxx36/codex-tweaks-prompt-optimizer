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

export const CLARIFICATION_INSTRUCTION = `你是提示词澄清助手。你只能根据用户给出的原始提示词和已经明确填写的回答判断还缺少哪些必要信息。

你必须只输出一个合法 JSON 对象，不要 Markdown 代码围栏，不要解释，不要输出其他文字：
{"questions":["问题一"],"readyToGenerate":false}

规则：
1. questions 必须是字符串数组，最多 3 个问题；如果信息足够，返回空数组并将 readyToGenerate 设为 true。
2. 只提出完成任务真正需要的问题，不能索取会话历史、文件、附件或项目上下文。
3. 不要替用户臆造答案；用户可以留空、跳过或取消。
4. readyToGenerate 为 false 时至少提出一个简短、可回答的问题。`;

export const DEFAULT_PROMPT_PRESETS = Object.freeze([
  {
    id: "general",
    name: "通用优化",
    instruction: DEFAULT_INSTRUCTION,
  },
  {
    id: "code",
    name: "编程开发",
    instruction: `你是一名资深代码架构与工程优化专家。请将用户的编程提示词改写得更严谨、具体、可测试。
要求：
1. 明确补充输入输出格式、边界条件、错误与异常处理机制、性能要求及单元测试用例。
2. 保留原技术栈、语言、库、URL 及专有名词，不臆造虚假依赖。
3. 只输出可直接使用的优化后提示词，不添加多余解释或外层代码围栏。`,
  },
  {
    id: "concise",
    name: "精准精简",
    instruction: `你是一名指令精炼专家。请在完整保留用户原始意图与关键约束的前提下，删除所有冗余寒暄、客套和废话。
要求：
1. 提炼为要点清晰、逻辑直接的 Bullet-points 或步骤指令。
2. 保持极致紧凑，突出核心输入、操作与期望输出。
3. 只输出可直接使用的优化后提示词，不包含解释或问候。`,
  },
  {
    id: "cot",
    name: "深度推理 (CoT)",
    instruction: `你是一名提示词工程与思维链架构专家。请将用户的问题或任务重构成具备结构化推理能力的提示词。
要求：
1. 引导模型按照“问题理解 -> 假设验证 -> 分步推导 -> 自我反思 -> 最终输出”的思考链条执行。
2. 明确输出校验标准与推导约束。
3. 只输出可直接使用的优化后提示词。`,
  },
  {
    id: "translate",
    name: "中英转译优化",
    instruction: `You are an expert prompt engineer. Transform the user's input into a world-class, professional English prompt tailored for state-of-the-art LLMs.
Requirements:
1. Use concise, unambiguous, and technical English terminology.
2. Structure the prompt with clear Context, Objective, Constraints, and Output Format.
3. Output ONLY the optimized prompt directly with no explanations.`,
  },
]);

export const DEFAULT_PROFILE = Object.freeze({
  id: "default-profile",
  name: "默认配置",
  protocol: "openaiResponses",
  baseUrl: "",
  apiKey: "",
  apiKeyConfigured: false,
  model: "",
  streaming: true,
});

export const DEFAULT_SETTINGS = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  enabled: true,
  streaming: true,
  mode: "direct",
  protocol: "openaiResponses",
  baseUrl: "",
  apiKey: "",
  apiKeyConfigured: false,
  model: "",
  instruction: DEFAULT_INSTRUCTION,
  historyLimit: 10,
  activeProfileId: "default-profile",
  profiles: [DEFAULT_PROFILE],
  activePresetId: "general",
  presets: DEFAULT_PROMPT_PRESETS,
  previewFontSize: 14,
  enableShortcut: true,
  previewSplitRatio: 0.4,
});

export function asTrimmedString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function boundedText(value, maximum, label) {
  const text = typeof value === "string" ? value : "";
  if (text.length > maximum) {
    const error = new Error(`${label}超过允许长度`);
    error.code = "input_too_large";
    throw error;
  }
  return text;
}

export function normalizeProfile(input = {}, existing = DEFAULT_PROFILE) {
  const src = isPlainObject(input) ? input : {};
  const prev = isPlainObject(existing) ? existing : DEFAULT_PROFILE;
  const hasNewKey = typeof src.apiKey === "string" && src.apiKey.trim().length > 0;
  const clearKey = src.clearApiKey === true;
  const apiKey = clearKey
    ? ""
    : hasNewKey
      ? src.apiKey.trim()
      : asTrimmedString(prev.apiKey, "");
  const protocol = PROTOCOLS.includes(src.protocol)
    ? src.protocol
    : PROTOCOLS.includes(prev.protocol)
      ? prev.protocol
      : DEFAULT_PROFILE.protocol;
  const streaming = src.streaming === undefined
    ? (prev.streaming === undefined ? true : Boolean(prev.streaming))
    : Boolean(src.streaming);

  return {
    id: asTrimmedString(src.id, prev.id || `prof-${Date.now()}`),
    name: asTrimmedString(src.name, prev.name || "未命名配置"),
    protocol,
    baseUrl: asTrimmedString(src.baseUrl, asTrimmedString(prev.baseUrl)),
    apiKey,
    apiKeyConfigured: apiKey.length > 0,
    model: asTrimmedString(src.model, asTrimmedString(prev.model)),
    streaming,
  };
}

export function normalizePreset(input = {}, existing = null) {
  const src = isPlainObject(input) ? input : {};
  const prev = isPlainObject(existing) ? existing : {};
  return {
    id: asTrimmedString(src.id, prev.id || `preset-${Date.now()}`),
    name: asTrimmedString(src.name, prev.name || "自定义预设"),
    instruction: asTrimmedString(src.instruction, prev.instruction || DEFAULT_INSTRUCTION),
  };
}

export function normalizeSettings(input = {}, existing = DEFAULT_SETTINGS) {
  const source = isPlainObject(input) ? input : {};
  const previous = isPlainObject(existing) ? existing : DEFAULT_SETTINGS;
  const requestedLimit = Number(source.historyLimit ?? previous.historyLimit);
  const historyLimit = HISTORY_LIMITS.includes(requestedLimit)
    ? requestedLimit
    : DEFAULT_SETTINGS.historyLimit;

  // Normalize profiles
  let rawProfiles = Array.isArray(source.profiles) ? source.profiles : previous.profiles;
  if (!Array.isArray(rawProfiles) || !rawProfiles.length) {
    const legacyProfile = {
      id: "default-profile",
      name: "默认配置",
      protocol: source.protocol || previous.protocol || "openaiResponses",
      baseUrl: source.baseUrl !== undefined ? source.baseUrl : previous.baseUrl,
      apiKey: source.apiKey !== undefined ? source.apiKey : previous.apiKey,
      clearApiKey: source.clearApiKey,
      model: source.model !== undefined ? source.model : previous.model,
      streaming: source.streaming !== undefined ? source.streaming : previous.streaming,
    };
    rawProfiles = [legacyProfile];
  }

  const profiles = rawProfiles.map((p) => {
    const existingP = Array.isArray(previous.profiles) ? previous.profiles.find((ep) => ep.id === p.id) : null;
    return normalizeProfile(p, existingP);
  });

  let activeProfileId = asTrimmedString(source.activeProfileId, previous.activeProfileId || profiles[0]?.id);
  if (!profiles.some((p) => p.id === activeProfileId)) {
    activeProfileId = profiles[0]?.id || "default-profile";
  }

  // If source specified top-level configuration without supplying an entire profiles array, update the active profile
  if (!Array.isArray(source.profiles)) {
    const activeIndex = profiles.findIndex((p) => p.id === activeProfileId);
    if (activeIndex >= 0) {
      const p = profiles[activeIndex];
      const hasNewKey = typeof source.apiKey === "string" && source.apiKey.trim().length > 0;
      const clearKey = source.clearApiKey === true;
      const apiKey = clearKey ? "" : (hasNewKey ? source.apiKey.trim() : p.apiKey);
      profiles[activeIndex] = {
        ...p,
        protocol: PROTOCOLS.includes(source.protocol) ? source.protocol : p.protocol,
        baseUrl: source.baseUrl !== undefined ? asTrimmedString(source.baseUrl) : p.baseUrl,
        apiKey,
        apiKeyConfigured: apiKey.length > 0,
        model: source.model !== undefined ? asTrimmedString(source.model) : p.model,
        streaming: source.streaming !== undefined ? Boolean(source.streaming) : p.streaming,
      };
    }
  } else {
    // If top-level fields were directly updated (e.g. external edits), sync them to active profile
    const activeIndex = profiles.findIndex((p) => p.id === activeProfileId);
    if (activeIndex >= 0) {
      if (source.model !== undefined && typeof source.model === "string" && source.model.trim() !== profiles[activeIndex].model) {
        profiles[activeIndex].model = source.model.trim();
      }
      if (source.baseUrl !== undefined && typeof source.baseUrl === "string" && source.baseUrl.trim() !== profiles[activeIndex].baseUrl) {
        profiles[activeIndex].baseUrl = source.baseUrl.trim();
      }
      if (source.protocol !== undefined && PROTOCOLS.includes(source.protocol) && source.protocol !== profiles[activeIndex].protocol) {
        profiles[activeIndex].protocol = source.protocol;
      }
    }
  }

  // Active profile determines root values
  const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0] || DEFAULT_PROFILE;
  const protocol = activeProfile.protocol;
  const baseUrl = activeProfile.baseUrl;
  const apiKey = activeProfile.apiKey;
  const apiKeyConfigured = activeProfile.apiKeyConfigured;
  const model = activeProfile.model;
  const streaming = activeProfile.streaming;

  // Normalize presets
  let rawPresets = Array.isArray(source.presets) ? source.presets : previous.presets;
  if (!Array.isArray(rawPresets) || !rawPresets.length) {
    rawPresets = DEFAULT_PROMPT_PRESETS;
  }
  const presets = rawPresets.map((p) => {
    const existingP = Array.isArray(previous.presets) ? previous.presets.find((ep) => ep.id === p.id) : null;
    return normalizePreset(p, existingP);
  });

  let activePresetId = asTrimmedString(source.activePresetId, previous.activePresetId || presets[0]?.id);
  if (!presets.some((p) => p.id === activePresetId)) {
    activePresetId = presets[0]?.id || "general";
  }

  const activePreset = presets.find((p) => p.id === activePresetId) || presets[0];
  const instruction = source.instruction !== undefined
    ? boundedText(asTrimmedString(source.instruction, activePreset?.instruction || DEFAULT_INSTRUCTION), MAX_INPUT_CHARS, "系统指令")
    : (activePreset?.instruction || previous.instruction || DEFAULT_INSTRUCTION);

  const rawFontSize = Number(source.previewFontSize ?? previous.previewFontSize ?? 14);
  const previewFontSize = Number.isFinite(rawFontSize) ? Math.min(20, Math.max(12, Math.round(rawFontSize))) : 14;

  const enableShortcut = typeof source.enableShortcut === "boolean" ? source.enableShortcut : (previous.enableShortcut !== false);

  const rawSplitRatio = Number(source.previewSplitRatio ?? previous.previewSplitRatio ?? 0.4);
  const previewSplitRatio = Number.isFinite(rawSplitRatio) ? Math.min(0.8, Math.max(0.2, Number(rawSplitRatio.toFixed(2)))) : 0.4;

  return {
    schemaVersion: SCHEMA_VERSION,
    enabled: typeof source.enabled === "boolean" ? source.enabled : previous.enabled,
    streaming,
    mode: MODES.includes(source.mode) ? source.mode : previous.mode,
    protocol,
    baseUrl,
    apiKey,
    apiKeyConfigured,
    model,
    instruction,
    historyLimit,
    activeProfileId,
    profiles,
    activePresetId,
    presets,
    previewFontSize,
    enableShortcut,
    previewSplitRatio,
  };
}

export function validateBaseUrl(url) {
  const trimmed = asTrimmedString(url);
  if (!trimmed) return "";
  let parsed = null;
  try {
    parsed = new URL(trimmed);
  } catch {
    const error = new Error("Base URL 格式无效");
    error.code = "invalid_base_url";
    throw error;
  }
  if (!["https:", "http:"].includes(parsed.protocol)) {
    const error = new Error("Base URL 仅支持 HTTP 或 HTTPS 协议");
    error.code = "invalid_base_url";
    throw error;
  }
  if (parsed.protocol === "http:" && !["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    const error = new Error("非本地地址必须使用 HTTPS");
    error.code = "insecure_base_url";
    throw error;
  }
  if (parsed.username || parsed.password) {
    const error = new Error("Base URL 中不得包含用户名或密码");
    error.code = "credentials_in_url";
    throw error;
  }
  return trimmed;
}

export function endpointCandidates(baseUrl, protocol) {
  const clean = asTrimmedString(baseUrl).replace(/\/+$/, "");
  if (!clean) return [];
  const hasV1 = /\/v1$/i.test(clean);
  if (protocol === "openaiResponses") {
    if (/\/responses$/i.test(clean)) return [clean];
    if (hasV1) return [`${clean}/responses`];
    return [`${clean}/responses`, `${clean}/v1/responses`];
  }
  if (protocol === "openaiChatCompletions") {
    if (/\/chat\/completions$/i.test(clean)) return [clean];
    if (hasV1) return [`${clean}/chat/completions`];
    return [`${clean}/chat/completions`, `${clean}/v1/chat/completions`];
  }
  if (protocol === "anthropicMessages") {
    if (/\/messages$/i.test(clean)) return [clean];
    if (hasV1) return [`${clean}/messages`];
    return [`${clean}/messages`, `${clean}/v1/messages`];
  }
  return [clean];
}

export function modelsEndpointCandidates(baseUrl) {
  const clean = asTrimmedString(baseUrl).replace(/\/+$/, "");
  if (!clean) return [];
  if (/\/models$/i.test(clean)) return [clean];
  const stripped = clean.replace(/\/(?:chat\/completions|responses|messages)$/i, "");
  if (/\/models$/i.test(stripped)) return [stripped];
  if (/\/v1$/i.test(stripped)) return [`${stripped}/models`];
  return [`${stripped}/models`, `${stripped}/v1/models`];
}
