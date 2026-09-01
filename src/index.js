import "./style.css";
import {
  BUTTON_CLASS,
  RESTORE_BUTTON_CLASS,
  ROOT_ATTRIBUTE,
  captureComposerContext,
  currentLocationHref,
  findBestComposer,
  findComposerActionAnchor,
  findComposerCandidates,
  findComposerRegion,
  getComposerButtonPosition,
  isExcludedFromComposer,
  isSameComposerContext,
  findModelPicker,
  modelOptionValues,
  readInputText,
  replaceInputText,
} from "./renderer-core.js";
import {
  PANEL_DEFAULT_HEIGHT,
  PANEL_DEFAULT_WIDTH,
  PANEL_MARGIN,
  findPanelPosition,
  normalizePanelSize,
} from "./panel-geometry.js";

export const RENDERER_DEFAULTS = {
  schemaVersion: 1,
  enabled: true,
  streaming: true,
  mode: "direct",
  protocol: "openaiResponses",
  baseUrl: "",
  apiKeyConfigured: false,
  model: "",
  instruction: "你是一名专业的提示词优化专家。请在不改变原始意图的前提下，将用户提供的提示词改写得更清晰、具体、可执行、可验证。\n\n要求：\n1. 保留原始提示词的语言、事实、URL、代码、数字、专有名词和明确的输出格式约束。\n2. 不要编造缺失事实；必要时使用清晰的占位符。\n3. 只输出可以直接使用的优化后提示词，不要添加解释、前言、后记或外层代码围栏。\n4. 不要读取或假设任何会话历史、文件、附件或项目上下文。",
  historyLimit: 10,
  activeProfileId: "default-profile",
  profiles: [],
  activePresetId: "general",
  presets: [],
};

const MODE_OPTIONS = [
  ["direct", "直接替换"],
  ["preview", "预览后应用"],
  ["clarify", "多轮澄清"],
];

const PROTOCOL_OPTIONS = [
  ["openaiResponses", "OpenAI Responses"],
  ["openaiChatCompletions", "OpenAI Chat Completions"],
  ["anthropicMessages", "Anthropic Messages"],
];

const HISTORY_OPTIONS = [0, 5, 10, 20, 50];
let instanceSequence = 0;

function makeId(prefix = "ctpo") {
  instanceSequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${instanceSequence.toString(36)}`;
}

function getDocument(root) {
  return root?.ownerDocument ?? (typeof document === "object" ? document : null);
}

function setAttributes(element, attributes = {}) {
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === null) continue;
    if (name === "className") {
      element.className = value;
      if (typeof element.setAttribute === "function") element.setAttribute("class", String(value));
      if (typeof value === "string" && element.classList?.add) {
        for (const cls of value.split(/\s+/).filter(Boolean)) element.classList.add(cls);
      }
    }
    else if (name === "textContent") element.textContent = value;
    else if (name === "checked" || name === "disabled" || name === "readOnly" || name === "hidden") element[name] = Boolean(value);
    else if (name === "value") element.value = value;
    else element.setAttribute(name, String(value));
  }
  return element;
}

function element(doc, tagName, attributes = {}, children = []) {
  const result = doc.createElement(tagName);
  setAttributes(result, attributes);
  for (const child of children) {
    if (child === null || child === undefined) continue;
    result.append(typeof child === "object" ? child : doc.createTextNode(String(child)));
  }
  return result;
}

function svgIcon(doc, name) {
  const paths = {
    spark: "M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2zm6.5 12.5l.8 2.7 2.7.8-2.7.8-.8 2.7-.8-2.7-2.7-.8 2.7-.8.8-2.7z",
    eye: "M2.2 12s3.3-5.2 9.8-5.2S21.8 12 21.8 12 18.5 17.2 12 17.2 2.2 12 2.2 12zm9.8 2.6a2.6 2.6 0 100-5.2 2.6 2.6 0 000 5.2z",
    close: "M5.2 5.2l13.6 13.6m0-13.6L5.2 18.8",
    copy: "M8 8h10v12H8zM6 16H4V4h12v2",
    refresh: "M20 11a8 8 0 00-14.7-4L3 10m0 0V4m0 6h6M4 13a8 8 0 0014.7 4L21 14m0 0v6m0-6h-6",
    trash: "M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3",
    check: "M5 12l4 4L19 6",
    cancel: "M6 6l12 12M18 6L6 18",
    chevron: "m7 10 5 5 5-5",
    star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
    starFilled: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
    code: "m16 18 6-6-6-6M8 6l-6 6 6 6",
    diff: "M9 14l-4-4 4-4m6 0l4 4-4 4",
    search: "m21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0z",
  };
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", name === "starFilled" ? "currentColor" : "none");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", paths[name] ?? paths.spark);
  svg.append(path);
  return svg;
}

export function renderSimpleMarkdown(doc, markdownText) {
  const container = element(doc, "div", { className: "ctpo-markdown-view" });
  const raw = String(markdownText ?? "").trim();
  if (!raw) {
    container.append(element(doc, "p", { className: "ctpo-hint" }, ["（无内容）"]));
    return container;
  }
  const lines = raw.split(/\r?\n/);
  let inCodeBlock = false;
  let codeLines = [];
  let currentList = null;
  let isNumberedList = false;

  const flushList = () => {
    if (currentList) {
      container.append(currentList);
      currentList = null;
    }
  };

  const flushCode = () => {
    if (codeLines.length) {
      const pre = element(doc, "pre");
      const code = element(doc, "code", {}, [codeLines.join("\n")]);
      pre.append(code);
      container.append(pre);
      codeLines = [];
    }
  };

  const renderInlineFormatted = (parent, text) => {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
        parent.append(element(doc, "code", {}, [part.slice(1, -1)]));
      } else if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
        parent.append(element(doc, "strong", {}, [part.slice(2, -2)]));
      } else if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
        parent.append(element(doc, "em", {}, [part.slice(1, -1)]));
      } else {
        parent.append(doc.createTextNode(part));
      }
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        flushCode();
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
        codeLines = [];
      }
      continue;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushList();
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushList();
      const h3 = element(doc, "h3");
      renderInlineFormatted(h3, trimmed.slice(4));
      container.append(h3);
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushList();
      const h2 = element(doc, "h2");
      renderInlineFormatted(h2, trimmed.slice(3));
      container.append(h2);
      continue;
    }
    if (trimmed.startsWith("# ")) {
      flushList();
      const h1 = element(doc, "h1");
      renderInlineFormatted(h1, trimmed.slice(2));
      container.append(h1);
      continue;
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!currentList || isNumberedList) {
        flushList();
        currentList = element(doc, "ul");
        isNumberedList = false;
      }
      const li = element(doc, "li");
      renderInlineFormatted(li, trimmed.slice(2));
      currentList.append(li);
      continue;
    }

    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      if (!currentList || !isNumberedList) {
        flushList();
        currentList = element(doc, "ol");
        isNumberedList = true;
      }
      const li = element(doc, "li");
      renderInlineFormatted(li, numMatch[2]);
      currentList.append(li);
      continue;
    }

    flushList();
    const p = element(doc, "p");
    renderInlineFormatted(p, line);
    container.append(p);
  }
  flushList();
  flushCode();
  return container;
}

export class TokenPool {
  constructor() {
    this.strToId = new Map();
    this.idToStr = [];
  }
  getId(str) {
    let id = this.strToId.get(str);
    if (id === undefined) {
      id = this.idToStr.length;
      this.strToId.set(str, id);
      this.idToStr.push(str);
    }
    return id;
  }
  getText(id) {
    return this.idToStr[id] ?? "";
  }
}

function computeLineLevelDiff(tokens1, tokens2) {
  const text1 = tokens1.join("");
  const text2 = tokens2.join("");
  const lines1 = text1.split("\n");
  const lines2 = text2.split("\n");

  const pool = new TokenPool();
  const a = new Int32Array(lines1.length);
  const b = new Int32Array(lines2.length);
  for (let i = 0; i < lines1.length; i++) {
    const suffix = i < lines1.length - 1 ? "\n" : "";
    a[i] = pool.getId(lines1[i] + suffix);
  }
  for (let j = 0; j < lines2.length; j++) {
    const suffix = j < lines2.length - 1 ? "\n" : "";
    b[j] = pool.getId(lines2[j] + suffix);
  }

  const maxBuf = 2 * (lines1.length + lines2.length + 2);
  const vf = new Int32Array(maxBuf);
  const vb = new Int32Array(maxBuf);

  const diff = [];
  myersLinear(a, 0, a.length, b, 0, b.length, pool, diff, vf, vb);
  return diff;
}

function findMiddleSnake(a, aStart, aEnd, b, bStart, bEnd, vf, vb) {
  const n = aEnd - aStart;
  const m = bEnd - bStart;
  const delta = n - m;
  const isOdd = (delta & 1) !== 0;
  const maxD = Math.ceil((n + m) / 2);
  const offset = n + m + 1;
  const bound = 2 * (n + m + 2);

  vf.fill(0, 0, bound);
  vb.fill(0, 0, bound);

  vf[1 + offset] = 0;
  vb[1 + offset] = 0;

  for (let d = 0; d <= maxD; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && vf[k - 1 + offset] < vf[k + 1 + offset])) {
        x = vf[k + 1 + offset];
      } else {
        x = vf[k - 1 + offset] + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[aStart + x] === b[bStart + y]) {
        x++;
        y++;
      }
      vf[k + offset] = x;

      if (isOdd && k >= delta - (d - 1) && k <= delta + (d - 1)) {
        if (x + vb[delta - k + offset] >= n) {
          return { midA: aStart + x, midB: bStart + y };
        }
      }
    }

    for (let k = -d; k <= d; k += 2) {
      let u;
      if (k === -d || (k !== d && vb[k - 1 + offset] < vb[k + 1 + offset])) {
        u = vb[k + 1 + offset];
      } else {
        u = vb[k - 1 + offset] + 1;
      }
      let v = u - k;
      while (u < n && v < m && a[aEnd - 1 - u] === b[bEnd - 1 - v]) {
        u++;
        v++;
      }
      vb[k + offset] = u;

      if (!isOdd && k >= delta - d && k <= delta + d) {
        if (u + vf[delta - k + offset] >= n) {
          return { midA: aEnd - u, midB: bEnd - v };
        }
      }
    }
  }

  return null;
}

function myersLinear(a, aStart, aEnd, b, bStart, bEnd, pool, out, vf, vb) {
  let n = aEnd - aStart;
  let m = bEnd - bStart;

  if (n <= 0 && m <= 0) return;
  if (n <= 0) {
    for (let j = bStart; j < bEnd; j++) out.push({ type: "add", text: pool.getText(b[j]) });
    return;
  }
  if (m <= 0) {
    for (let i = aStart; i < aEnd; i++) out.push({ type: "del", text: pool.getText(a[i]) });
    return;
  }

  let p = 0;
  while (p < n && p < m && a[aStart + p] === b[bStart + p]) p++;
  if (p > 0) {
    for (let i = 0; i < p; i++) out.push({ type: "same", text: pool.getText(a[aStart + i]) });
    aStart += p;
    bStart += p;
    n -= p;
    m -= p;
  }

  let s = 0;
  while (s < n && s < m && a[aEnd - 1 - s] === b[bEnd - 1 - s]) s++;
  const suffixStartA = aEnd - s;
  const suffixStartB = bEnd - s;
  aEnd -= s;
  bEnd -= s;
  n -= s;
  m -= s;

  if (n > 0 || m > 0) {
    if (n === 0) {
      for (let j = bStart; j < bEnd; j++) out.push({ type: "add", text: pool.getText(b[j]) });
    } else if (m === 0) {
      for (let i = aStart; i < aEnd; i++) out.push({ type: "del", text: pool.getText(a[i]) });
    } else {
      const snake = findMiddleSnake(a, aStart, aEnd, b, bStart, bEnd, vf, vb);
      if (snake && (snake.midA > aStart || snake.midB > bStart) && (snake.midA < aEnd || snake.midB < bEnd)) {
        myersLinear(a, aStart, snake.midA, b, bStart, snake.midB, pool, out, vf, vb);
        myersLinear(a, snake.midA, aEnd, b, snake.midB, bEnd, pool, out, vf, vb);
      } else {
        for (let i = aStart; i < aEnd; i++) out.push({ type: "del", text: pool.getText(a[i]) });
        for (let j = bStart; j < bEnd; j++) out.push({ type: "add", text: pool.getText(b[j]) });
      }
    }
  }

  if (s > 0) {
    for (let i = 0; i < s; i++) out.push({ type: "same", text: pool.getText(a[suffixStartA + i]) });
  }
}

export function computeLcsDiff(tokens1, tokens2) {
  const t1 = Array.isArray(tokens1) ? tokens1 : [];
  const t2 = Array.isArray(tokens2) ? tokens2 : [];
  const n = t1.length;
  const m = t2.length;
  if (n === 0 && m === 0) return [];
  if (n === 0) return t2.map((t) => ({ type: "add", text: t }));
  if (m === 0) return t1.map((t) => ({ type: "del", text: t }));

  if (n + m > 10000) {
    return computeLineLevelDiff(t1, t2);
  }

  const pool = new TokenPool();
  const a = new Int32Array(n);
  const b = new Int32Array(m);
  for (let i = 0; i < n; i++) a[i] = pool.getId(t1[i]);
  for (let j = 0; j < m; j++) b[j] = pool.getId(t2[j]);

  const maxBuf = 2 * (n + m + 2);
  const vf = new Int32Array(maxBuf);
  const vb = new Int32Array(maxBuf);

  const diff = [];
  myersLinear(a, 0, n, b, 0, m, pool, diff, vf, vb);
  return diff;
}

export function renderSimpleDiff(doc, original, result) {
  const container = element(doc, "div", { className: "ctpo-diff-container" });
  const tokenize = (str) => String(str ?? "").split(/(\s+|[，。！？、；：""''（）\n\r]+|[.,!?;:()]+)/g).filter(Boolean);
  const t1 = tokenize(original);
  const t2 = tokenize(result);
  const diff = computeLcsDiff(t1, t2);

  const fragment = doc.createDocumentFragment ? doc.createDocumentFragment() : container;
  let currentType = null;
  let currentText = "";

  const flush = () => {
    if (!currentText) return;
    if (currentType === "same") {
      fragment.append(doc.createTextNode ? doc.createTextNode(currentText) : currentText);
    } else if (currentType === "del") {
      fragment.append(element(doc, "del", { className: "ctpo-diff-del" }, [currentText]));
    } else if (currentType === "add") {
      fragment.append(element(doc, "ins", { className: "ctpo-diff-add" }, [currentText]));
    }
    currentText = "";
  };

  for (const item of diff) {
    if (item.type !== currentType) {
      flush();
      currentType = item.type;
    }
    currentText += item.text;
  }
  flush();

  if (fragment !== container) {
    container.append(fragment);
  }
  return container;
}

function actionButton(doc, label, action, { kind = "default", icon, title, disabled = false } = {}) {
  const button = element(doc, "button", {
    type: "button",
    className: `ctpo-button ${kind === "primary" ? "ctpo-button-primary" : ""} ${kind === "danger" ? "ctpo-button-danger" : ""}`.trim(),
    "data-ctpo-action": action,
    "data-ctpo-tooltip": title || undefined,
    disabled,
  });
  if (icon) button.append(svgIcon(doc, icon));
  button.append(doc.createTextNode(label));
  return button;
}

function field(doc, labelText, control, hintText, hintId) {
  const label = element(doc, "label", { className: "ctpo-field" });
  const labelNode = element(doc, "span", { className: "ctpo-label" }, [labelText]);
  label.append(labelNode, control);
  if (hintText) label.append(element(doc, "span", { className: "ctpo-hint", id: hintId }, [hintText]));
  return label;
}

async function copyText(text) {
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fallback
    }
  }
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.append(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand("copy");
  } catch {
    const error = new Error("无法复制文本到剪贴板");
    error.code = "clipboard_error";
    throw error;
  } finally {
    textArea.remove();
  }
}

function setViewBusy(view, busy) {
  view.busy = busy;
  if (!view.container) return;
  for (const control of view.container.querySelectorAll?.("button, input, select, textarea") ?? []) {
    control.disabled = busy;
  }
}

function createSettingsId(view, suffix) {
  return `ctpo-${view.id}-${suffix}`;
}

export function showModalDialog({ doc = document, title, message = "", inputPlaceholder = "", initialValue = "", showInput = false, confirmText = "确定", cancelText = "取消", isDanger = false, onConfirm }) {
  const existing = doc.querySelector(".ctpo-modal-overlay");
  if (existing) existing.remove();

  const overlay = element(doc, "div", { className: "ctpo-modal-overlay" });
  overlay.setAttribute(ROOT_ATTRIBUTE, "");
  const modal = element(doc, "div", { className: "ctpo-modal-dialog", role: "dialog", "aria-modal": "true" });

  const titleEl = element(doc, "h3", { className: "ctpo-modal-title" }, [title]);
  modal.append(titleEl);

  if (message) {
    modal.append(element(doc, "p", { className: "ctpo-modal-message" }, [message]));
  }

  let inputEl = null;
  if (showInput) {
    inputEl = element(doc, "input", {
      type: "text",
      className: "ctpo-modal-input",
      placeholder: inputPlaceholder,
      value: initialValue,
    });
    modal.append(inputEl);
  }

  const actions = element(doc, "div", { className: "ctpo-actions ctpo-modal-actions" });
  const confirmBtn = actionButton(doc, confirmText, "modal-confirm", {
    icon: "check",
    kind: isDanger ? "danger" : "primary",
  });
  const cancelBtn = actionButton(doc, cancelText, "modal-cancel", { icon: "cancel" });

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Enter" && (!inputEl || doc.activeElement === inputEl)) {
      e.preventDefault();
      submit();
    }
  };

  const close = () => {
    overlay.remove();
    doc.removeEventListener("keydown", onKeyDown);
  };

  const submit = async () => {
    const value = inputEl ? inputEl.value.trim() : "";
    if (showInput && !value) {
      inputEl.focus();
      return;
    }
    close();
    if (typeof onConfirm === "function") {
      await onConfirm(value);
    }
  };

  confirmBtn.addEventListener("click", submit);
  cancelBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  actions.append(confirmBtn, cancelBtn);
  modal.append(actions);
  overlay.append(modal);
  doc.body?.append(overlay);
  doc.addEventListener("keydown", onKeyDown);

  if (inputEl) {
    setTimeout(() => {
      inputEl.focus();
      inputEl.select();
    }, 20);
  } else {
    setTimeout(() => confirmBtn.focus(), 20);
  }
}

function createPanelLayout(layout = {}) {
  return {
    width: Number(layout.width) || PANEL_DEFAULT_WIDTH,
    height: Number(layout.height) || PANEL_DEFAULT_HEIGHT,
    left: Number.isFinite(layout.left) ? layout.left : null,
    top: Number.isFinite(layout.top) ? layout.top : null,
    manual: Boolean(layout.manual),
  };
}

function finiteNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function geometryRect(element) {
  if (!element || typeof element.getBoundingClientRect !== "function") return null;
  const rect = element.getBoundingClientRect();
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function transformZoom(element) {
  if (!element?.ownerDocument?.defaultView) return null;
  const view = element.ownerDocument.defaultView;
  try {
    const style = view.getComputedStyle(element);
    return {
      zoom: style.zoom ?? "normal",
      transform: style.transform ?? "none",
    };
  } catch {
    return null;
  }
}

export class StreamBatchScheduler {
  constructor(onFlush) {
    this.onFlush = onFlush;
    this.pendingAccumulated = "";
    this.timer = null;
    this.isStreaming = false;
  }

  push(accumulated, isDone) {
    this.pendingAccumulated = accumulated;
    this.isStreaming = !isDone;
    if (isDone) {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      this.onFlush(this.pendingAccumulated, true);
      return;
    }
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.onFlush(this.pendingAccumulated, false);
      }, 33);
    }
  }

  cancel() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.isStreaming = false;
  }
}

export function activate({ root, onCleanup, api: _api, ui, node } = {}) {
  const doc = getDocument(root);
  if (!doc) throw new Error("无法获取当前文档对象");

  const uiRoot = element(doc, "div", {
    [ROOT_ATTRIBUTE]: "",
    className: "ctpo-ui-root",
  });
  uiRoot.style.inset = "0";
  uiRoot.style.pointerEvents = "none";
  uiRoot.style.position = "fixed";
  uiRoot.style.zIndex = "2147482998";
  doc.body?.append(uiRoot);

  const toastHost = element(doc, "div", { [ROOT_ATTRIBUTE]: "", className: "ctpo-toast-host" });
  toastHost.style.inset = "0";
  toastHost.style.pointerEvents = "none";
  toastHost.style.position = "fixed";
  toastHost.style.zIndex = "2147483001";
  uiRoot.append(toastHost);

  const panelHost = element(doc, "div", { [ROOT_ATTRIBUTE]: "", className: "ctpo-panel-host" });
  panelHost.style.inset = "0";
  panelHost.style.pointerEvents = "none";
  panelHost.style.position = "fixed";
  panelHost.style.zIndex = "2147483000";
  uiRoot.append(panelHost);

  const composerButtonHost = element(doc, "div", { [ROOT_ATTRIBUTE]: "", className: "ctpo-composer-host" });
  composerButtonHost.style.inset = "0";
  composerButtonHost.style.pointerEvents = "none";
  composerButtonHost.style.position = "fixed";
  composerButtonHost.style.zIndex = "2147482999";
  uiRoot.append(composerButtonHost);

  const customTooltip = element(doc, "div", {
    [ROOT_ATTRIBUTE]: "",
    className: "ctpo-tooltip",
    role: "tooltip",
    "aria-hidden": "true",
  });
  uiRoot.append(customTooltip);

  const state = {
    settings: { ...RENDERER_DEFAULTS },
    history: [],
    notice: { text: "", kind: "" },
    attached: new Map(),
    settingsViews: new Set(),
    activeOperations: new Map(),
    pendingResults: new Map(),
    panel: null,
    composerMenu: null,
    latestSnapshot: null,
    latestRestoreEntry: null,
    settingsDialog: null,
    panelHost,
    composerButtonHost,
    panelResizeObserver: null,
    panelDragCleanup: null,
    panelContextCleanup: null,
    scanTimer: null,
    scanRaf: null,
    debugGeometry: false,
    debugGeometryReports: [],
    disposed: false,
  };

  let tooltipTarget = null;
  let tooltipTimer = null;

  const showCustomTooltip = (target, text) => {
    if (!target || !text || !target.isConnected || state.disposed) return;
    customTooltip.textContent = text;
    customTooltip.style.visibility = "hidden";
    customTooltip.style.display = "block";
    customTooltip.style.opacity = "0";

    const targetRect = target.getBoundingClientRect?.();
    const tooltipRect = customTooltip.getBoundingClientRect?.();
    const viewport = viewportSize();

    if (!targetRect || !tooltipRect) return;

    const tooltipWidth = Number(tooltipRect.width) || 120;
    const tooltipHeight = Number(tooltipRect.height) || 26;

    let left = targetRect.left + (targetRect.width - tooltipWidth) / 2;
    left = Math.max(8, Math.min(left, viewport.width - tooltipWidth - 8));

    let top = targetRect.bottom + 6;
    if (top + tooltipHeight > viewport.height - 8) {
      top = Math.max(8, targetRect.top - tooltipHeight - 6);
    }

    customTooltip.style.left = `${Math.round(left)}px`;
    customTooltip.style.top = `${Math.round(top)}px`;
    customTooltip.style.visibility = "visible";
    customTooltip.style.opacity = "1";
    customTooltip.style.transform = "translateY(0)";
  };

  const hideCustomTooltip = () => {
    tooltipTarget = null;
    if (tooltipTimer) {
      clearTimeout(tooltipTimer);
      tooltipTimer = null;
    }
    customTooltip.style.opacity = "0";
    customTooltip.style.visibility = "hidden";
    customTooltip.style.transform = "translateY(2px)";
  };

  const onGlobalPointerOver = (e) => {
    if (state.disposed) return;
    const target = e.target?.closest?.("[data-ctpo-tooltip]");
    if (!target) return;
    const text = target.getAttribute("data-ctpo-tooltip");
    if (!text) return;
    tooltipTarget = target;
    if (tooltipTimer) clearTimeout(tooltipTimer);
    tooltipTimer = setTimeout(() => {
      if (tooltipTarget === target && target.isConnected && !state.disposed) {
        showCustomTooltip(target, text);
      }
    }, 180);
  };

  const onGlobalPointerOut = (e) => {
    const target = e.target?.closest?.("[data-ctpo-tooltip]");
    if (target && target === tooltipTarget) {
      hideCustomTooltip();
    }
  };

  const onGlobalPointerDown = () => {
    hideCustomTooltip();
  };

  doc.addEventListener("pointerover", onGlobalPointerOver, true);
  doc.addEventListener("pointerout", onGlobalPointerOut, true);
  doc.addEventListener("pointerdown", onGlobalPointerDown, true);

  const documentHref = () => currentLocationHref(doc);
  const viewportSize = () => ({
    width: doc.defaultView?.innerWidth ?? 1200,
    height: doc.defaultView?.innerHeight ?? 800,
  });

  const visualViewportGeometry = () => {
    const visual = doc.defaultView?.visualViewport;
    if (!visual) return null;
    return {
      width: Math.round(visual.width),
      height: Math.round(visual.height),
      scale: visual.scale ?? 1,
      offsetLeft: Math.round(visual.offsetLeft ?? 0),
      offsetTop: Math.round(visual.offsetTop ?? 0),
      pageLeft: Math.round(visual.pageLeft ?? 0),
      pageTop: Math.round(visual.pageTop ?? 0),
    };
  };

  let toastTimer = null;
  const showToast = (message, kind = "info") => {
    if (state.disposed) return;
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    const toast = element(doc, "div", {
      className: `ctpo-toast ctpo-toast-${kind}`,
      role: "status",
      "aria-live": "polite",
    }, [message]);
    toast.style.pointerEvents = "auto";
    toast.style.position = "fixed";
    toast.style.right = "16px";
    toast.style.bottom = "16px";
    toast.style.zIndex = "2147483001";
    toastHost.replaceChildren(toast);
    toastTimer = setTimeout(() => {
      toastTimer = null;
      if (toast.parentElement === toastHost) toastHost.replaceChildren();
    }, 5000);
  };

  const setNotice = (text, kind = "") => {
    state.notice = { text, kind };
    for (const view of state.settingsViews) {
      if (view.status) {
        view.status.textContent = text;
        view.status.dataset.kind = kind;
      }
    }
  };

  const refreshSettingsViews = () => {
    for (const view of state.settingsViews) view.render?.();
  };

  const refreshDebugOutputViews = () => {
    for (const view of state.settingsViews) {
      if (view.debugOutput) view.debugOutput.value = JSON.stringify(state.debugGeometryReports, null, 2);
    }
  };

  const callNode = async (method, payload = {}) => {
    if (!node?.invoke) throw new Error("Node 运行时不可用");
    const response = await node.invoke(method, payload);
    if (!response || response.status === "failed") {
      const error = new Error(response?.message || "请求失败");
      error.code = response?.code || "request_failed";
      throw error;
    }
    return response;
  };

  const currentComposer = () => findBestComposer(doc);

  const panelAnchorRect = (panelState) => {
    const contextElement = panelState?.context?.element;
    if (!contextElement || !contextElement.isConnected) return null;
    const target = findComposerRegion(contextElement) ?? contextElement;
    return target.getBoundingClientRect?.() ?? null;
  };

  const persistAccepted = async ({ original, result, clarifications = [], mode = "direct" }) => {
    const historyLimit = state.settings.historyLimit;
    if (historyLimit === 0) return;
    const historyRecord = {
      id: makeId("history"),
      original,
      result,
      clarifications,
      mode,
      createdAt: new Date().toISOString(),
    };
    const response = await callNode("save-settings", { historyRecord });
    if (response.settings) state.settings = { ...RENDERER_DEFAULTS, ...response.settings };
    const listed = await callNode("list-history");
    state.history = Array.isArray(listed.entries) ? listed.entries : [];
    refreshSettingsViews();
  };

  const positionComposerButton = (entry, { previousAnchor = null, phase = "position" } = {}) => {
    if (!entry.button.parentElement || state.disposed) return;
    const anchorRect = entry.anchor.getBoundingClientRect?.();
    if (!anchorRect) return;

    const totalButtonWidth = 68 + (entry.menuButton ? 24 : 0);
    const combinedButtonRect = { width: totalButtonWidth, height: 28 };

    const lastRect = entry.lastAnchorRect;
    if (
      lastRect
      && Math.abs(lastRect.left - (Number(anchorRect.left) || 0)) < 0.5
      && Math.abs(lastRect.top - (Number(anchorRect.top) || 0)) < 0.5
      && Math.abs(lastRect.height - (Number(anchorRect.height) || 0)) < 0.5
      && !entry.button.hidden
    ) {
      return;
    }

    const position = getComposerButtonPosition(anchorRect, combinedButtonRect, viewportSize(), 6);
    if (!position) {
      entry.button.hidden = true;
      if (entry.menuButton) entry.menuButton.hidden = true;
      if (entry.restoreButton) entry.restoreButton.hidden = true;
      entry.lastAnchorRect = null;
      recordGeometry(entry, `position:hidden:${phase}`, previousAnchor);
      return;
    }

    entry.lastAnchorRect = {
      left: Number(anchorRect.left) || 0,
      top: Number(anchorRect.top) || 0,
      height: Number(anchorRect.height) || 0,
    };

    const btnW = 68;
    entry.button.style.left = `${position.left}px`;
    entry.button.style.top = `${position.top}px`;
    entry.button.hidden = false;

    if (entry.menuButton) {
      entry.menuButton.style.left = `${position.left + btnW}px`;
      entry.menuButton.style.top = `${position.top}px`;
      entry.menuButton.hidden = false;
    }

    if (entry.restoreButton) {
      const restoreWidth = 96;
      entry.restoreButton.style.left = `${position.left - restoreWidth - 6}px`;
      entry.restoreButton.style.top = `${position.top}px`;
      entry.restoreButton.hidden = false;
    }
    recordGeometry(entry, `position:placed:${phase}`, previousAnchor);
  };

  const placeComposerButton = (entry, anchor, { previousAnchor = null, phase = "place" } = {}) => {
    entry.anchor = anchor;
    entry.button.style.pointerEvents = "auto";
    entry.button.style.position = "fixed";
    entry.button.style.zIndex = "2147482999";
    composerButtonHost.append(entry.button);

    if (entry.menuButton) {
      entry.menuButton.style.pointerEvents = "auto";
      entry.menuButton.style.position = "fixed";
      entry.menuButton.style.zIndex = "2147482999";
      composerButtonHost.append(entry.menuButton);
    }
    positionComposerButton(entry, { previousAnchor, phase });
  };

  const updateButton = (entry, busy) => {
    if (!entry?.button) return;
    entry.busy = busy;
    entry.button.dataset.busy = busy ? "true" : "false";
    entry.button.setAttribute("aria-busy", busy ? "true" : "false");
    entry.button.replaceChildren(svgIcon(doc, busy ? "cancel" : "spark"), doc.createTextNode(busy ? "取消" : "优化"));
    entry.button.removeAttribute("title");
    entry.button.setAttribute("data-ctpo-tooltip", busy ? "取消当前优化请求" : "优化当前提示词");
  };

  const recordGeometry = (entry, phase = "snapshot", oldAnchor = null) => {
    if (!state.debugGeometry || !entry?.element) return;
    const composerRegion = findComposerRegion(entry.element) ?? entry.element;
    const modelPicker = findModelPicker(entry.element);
    state.debugGeometryReports.push({
      schema: "ctpo-geometry-v1",
      timestamp: new Date().toISOString(),
      phase,
      composerClass: entry.element.className,
      composerTag: entry.element.tagName,
      composerConnected: entry.element.isConnected,
      anchorConnected: entry.anchor?.isConnected ?? false,
      anchorClass: entry.anchor?.className,
      anchorTag: entry.anchor?.tagName,
      hasModelPicker: Boolean(modelPicker),
      composerRect: geometryRect(entry.element),
      composerRegionRect: geometryRect(composerRegion),
      previousAnchorRect: geometryRect(oldAnchor),
      anchorRect: geometryRect(entry.anchor),
      modelPickerRect: geometryRect(modelPicker),
      buttonRect: geometryRect(entry.button),
      buttonHostRect: geometryRect(composerButtonHost),
      viewport: {
        ...viewportSize(),
        scrollX: finiteNumber(doc.defaultView?.scrollX),
        scrollY: finiteNumber(doc.defaultView?.scrollY),
        clientWidth: finiteNumber(doc.documentElement?.clientWidth),
        clientHeight: finiteNumber(doc.documentElement?.clientHeight),
      },
      visualViewport: visualViewportGeometry(),
      transformZoom: {
        composer: transformZoom(composerRegion),
        previousAnchor: transformZoom(oldAnchor),
        anchor: transformZoom(entry.anchor),
        modelPicker: transformZoom(modelPicker),
        button: transformZoom(entry.button),
        buttonHost: transformZoom(composerButtonHost),
      },
    });
    if (state.debugGeometryReports.length > 60) state.debugGeometryReports.shift();
    refreshDebugOutputViews();
  };

  const panelSessionIsCurrent = (panelState) => {
    if (!panelState) return false;
    if (panelState.locationHref && panelState.locationHref !== documentHref()) return false;
    const context = panelState.context;
    return !context || isSameComposerContext(context, context.element, currentLocationHref(context.element));
  };

  const readPanelSize = (panel, layout, anchor) => {
    const rect = panel.getBoundingClientRect?.();
    const anchorWidth = anchor ? anchor.right - anchor.left : 0;
    return normalizePanelSize(
      layout.autoWidth && anchorWidth > 0 ? anchorWidth : (rect?.width || layout.width),
      rect?.height || layout.height,
      viewportSize(),
    );
  };

  const applyPanelGeometry = (panel, panelState, { preservePosition = false } = {}) => {
    if (!panel || !panelState) return;
    const layout = panelState.layout ?? createPanelLayout();
    const anchor = panelAnchorRect(panelState);
    const size = readPanelSize(panel, layout, anchor);
    const preferred = preservePosition && Number.isFinite(layout.left) && Number.isFinite(layout.top)
      ? { left: layout.left, top: layout.top }
      : null;
    const position = findPanelPosition({
      anchor,
      width: size.width,
      height: size.height,
      viewport: viewportSize(),
      preferred,
    });
    panel.style.width = `${size.width}px`;
    panel.style.height = `${size.height}px`;
    panel.style.left = `${position.left}px`;
    panel.style.top = `${position.top}px`;
    panelState.layout = { ...layout, ...size, ...position };
  };

  const clearPanelInteractions = () => {
    state.panelResizeObserver?.disconnect?.();
    state.panelResizeObserver = null;
    state.panelDragCleanup?.();
    state.panelDragCleanup = null;
    state.panelContextCleanup?.();
    state.panelContextCleanup = null;
  };

  const installPanelInteractions = (panel, panelState) => {
    const header = panel.querySelector?.(".ctpo-panel-header");
    const view = doc.defaultView;
    if (!header || !view) return;
    const onPointerDown = (event) => {
      if (event.button !== 0 || event.target?.closest?.("button, input, textarea, select")) return;
      const startRect = panel.getBoundingClientRect?.();
      if (!startRect) return;
      const startX = event.clientX;
      const startY = event.clientY;
      panelState.layout = { ...createPanelLayout(panelState.layout), manual: true };
      header.dataset.dragging = "true";
      event.preventDefault?.();
      const onPointerMove = (moveEvent) => {
        if (state.panel !== panelState) return;
        const position = findPanelPosition({
          anchor: panelAnchorRect(panelState),
          width: Number(panelState.layout?.width) || PANEL_DEFAULT_WIDTH,
          height: Number(panelState.layout?.height) || PANEL_DEFAULT_HEIGHT,
          viewport: viewportSize(),
          preferred: {
            left: startRect.left + (moveEvent.clientX - startX),
            top: startRect.top + (moveEvent.clientY - startY),
          },
        });
        panel.style.left = `${position.left}px`;
        panel.style.top = `${position.top}px`;
        panelState.layout = { ...panelState.layout, ...position, manual: true };
      };
      const onPointerUp = () => {
        header.dataset.dragging = "false";
        view.removeEventListener("pointermove", onPointerMove);
        view.removeEventListener("pointerup", onPointerUp);
        view.removeEventListener("pointercancel", onPointerUp);
      };
      view.addEventListener("pointermove", onPointerMove);
      view.addEventListener("pointerup", onPointerUp);
      view.addEventListener("pointercancel", onPointerUp);
    };

    header.addEventListener("pointerdown", onPointerDown);
    state.panelDragCleanup = () => header.removeEventListener("pointerdown", onPointerDown);

    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry || state.panel !== panelState) return;
        const width = Math.round(entry.contentRect?.width || panel.offsetWidth);
        const height = Math.round(entry.contentRect?.height || panel.offsetHeight);
        if (width > 0 && height > 0) {
          panelState.layout = { ...panelState.layout, width, height };
        }
      });
      observer.observe(panel);
      state.panelResizeObserver = observer;
    }
  };

  const closePanel = () => {
    streamBatchScheduler?.cancel();
    clearPanelInteractions();
    panelHost.replaceChildren();
    state.panel = null;
  };

  const closeComposerMenu = () => {
    if (!state.composerMenu) return;
    state.composerMenu.entry?.menuButton?.setAttribute("aria-expanded", "false");
    state.composerMenu.element?.remove();
    state.composerMenu = null;
  };

  const openComposerMenu = (entry) => {
    if (!entry?.button || !composerButtonHost || state.disposed) return;
    if (state.composerMenu?.entry === entry) {
      closeComposerMenu();
      return;
    }
    closeComposerMenu();
    const menu = element(doc, "div", {
      className: "ctpo-composer-menu",
      role: "menu",
      "aria-label": "提示词优化菜单",
    });

    const settings = state.settings;
    const presets = Array.isArray(settings.presets) && settings.presets.length
      ? settings.presets
      : [
        { id: "general", name: "通用优化" },
        { id: "code", name: "编程开发" },
        { id: "concise", name: "精准精简" },
        { id: "cot", name: "深度推理 (CoT)" },
        { id: "translate", name: "中英转译" },
      ];

    const presetLabel = element(doc, "div", { className: "ctpo-menu-section-label" }, ["场景预设"]);
    const presetSection = element(doc, "div", { className: "ctpo-menu-presets" }, [presetLabel]);

    for (const p of presets) {
      const isSelected = (settings.activePresetId || "general") === p.id;
      const checkIcon = isSelected ? svgIcon(doc, "check") : element(doc, "span", { style: "display:inline-block;width:13px;" });
      const btn = element(doc, "button", {
        type: "button",
        className: "ctpo-menu-item",
        role: "menuitem",
        "data-selected": isSelected ? "true" : "false",
        "data-ctpo-tooltip": `切换为【${p.name}】场景预设`,
      }, [
        element(doc, "span", { className: "ctpo-menu-item-icon" }, [checkIcon]),
        element(doc, "span", { style: "overflow:hidden;text-overflow:ellipsis;" }, [p.name]),
      ]);
      btn.addEventListener("click", async () => {
        closeComposerMenu();
        try {
          const res = await callNode("select-preset", { presetId: p.id });
          state.settings = { ...state.settings, ...res.settings };
          showToast(`已切换到【${p.name}】场景预设`, "success");
        } catch (e) {
          showToast(e.message, "error");
        }
      });
      presetSection.append(btn);
    }
    menu.append(presetSection);

    const actionLabel = element(doc, "div", { className: "ctpo-menu-section-label" }, ["快捷操作"]);
    const actionSection = element(doc, "div", { style: "display:flex;flex-direction:column;gap:2px;" }, [actionLabel]);

    const settingsBtn = element(doc, "button", {
      type: "button",
      className: "ctpo-menu-item",
      role: "menuitem",
    }, [
      element(doc, "span", { className: "ctpo-menu-item-icon" }, [svgIcon(doc, "spark")]),
      element(doc, "span", {}, ["提示词优化设置"]),
    ]);
    settingsBtn.addEventListener("click", () => {
      closeComposerMenu();
      openSettings();
    });

    const historyBtn = element(doc, "button", {
      type: "button",
      className: "ctpo-menu-item",
      role: "menuitem",
    }, [
      element(doc, "span", { className: "ctpo-menu-item-icon" }, [svgIcon(doc, "eye")]),
      element(doc, "span", {}, ["优化历史与收藏"]),
    ]);
    historyBtn.addEventListener("click", () => {
      closeComposerMenu();
      openSettings({ focusHistory: true });
    });

    actionSection.append(settingsBtn, historyBtn);
    menu.append(actionSection);

    composerButtonHost.append(menu);

    const triggerRect = entry.button.getBoundingClientRect?.();
    const menuRect = menu.getBoundingClientRect?.();
    const viewport = viewportSize();
    const width = Number(menuRect?.width) || 210;
    const height = Number(menuRect?.height) || 240;

    let left = Number(triggerRect?.left) || 8;
    if (left + width > viewport.width - 8) {
      left = Math.max(8, (Number(triggerRect?.right) || width + 8) - width);
    }
    let top = (Number(triggerRect?.top) || 0) - height - 12;
    if (top < 8) {
      top = Math.min((Number(triggerRect?.bottom) || 0) + 12, viewport.height - height - 8);
    }
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    state.composerMenu = { entry, element: menu };
    entry.menuButton?.setAttribute("aria-expanded", "true");
    settingsBtn.focus?.();
  };

  const ensureRestoreButton = (entry, snapshot) => {
    if (!entry?.button || !composerButtonHost || !snapshot) return;
    if (state.latestRestoreEntry && state.latestRestoreEntry !== entry) {
      state.latestRestoreEntry.restoreButton?.remove();
      state.latestRestoreEntry.restoreButton = null;
    }
    state.latestSnapshot = snapshot;
    state.latestRestoreEntry = entry;
    if (!entry.restoreButton) {
      const restore = actionButton(doc, "恢复原文", "restore", { icon: "refresh", title: "恢复本次优化前的原文" });
      restore.classList.add(RESTORE_BUTTON_CLASS);
      restore.addEventListener("click", () => {
        if (!isSameComposerContext(snapshot.context, entry.element, currentLocationHref(entry.element), snapshot.result)) {
          showToast("当前 Composer 已变化，未恢复旧原文。", "error");
          return;
        }
        replaceInputText(entry.element, snapshot.original);
        entry.restoreButton?.remove();
        entry.restoreButton = null;
        if (state.latestSnapshot === snapshot) state.latestSnapshot = null;
        if (state.latestRestoreEntry === entry) state.latestRestoreEntry = null;
        showToast("已恢复本次优化前的原文", "success");
      });
      restore.hidden = true;
      restore.style.pointerEvents = "auto";
      restore.style.position = "fixed";
      restore.style.zIndex = "2147482999";
      composerButtonHost.append(restore);
      entry.restoreButton = restore;
      positionComposerButton(entry);
    }
  };

  const showPreview = ({ original, result, clarifications = [], mode = "preview", context = null, fromHistory = false, layout = null, isStreaming = false }) => {
    const inheritedLayout = layout ?? state.panel?.layout;
    state.panel = {
      kind: "preview",
      original,
      result,
      clarifications,
      mode,
      context,
      fromHistory,
      isStreaming,
      viewTab: "edit",
      locationHref: documentHref(),
      layout: createPanelLayout(inheritedLayout ?? {}),
      notice: fromHistory ? "历史记录只会在你明确应用或复制时写入当前 Composer。" : "",
    };
    renderPanel();
  };

  const startOptimization = async (entry) => {
    if (!entry || state.disposed) return;
    closeComposerMenu();
    closeSettingsDialog();
    if (entry.busy) {
      const operation = entry.operation;
      const panelOperation = state.panel?.context?.element === entry.element && state.panel.operationId
        ? { method: state.panel.operationMethod, id: state.panel.operationId }
        : operation;
      if (panelOperation) node?.invoke?.(panelOperation.method, { operationId: panelOperation.id, cancel: true }).catch?.(() => {});
      return;
    }
    const original = readInputText(entry.element);
    if (!original.trim()) {
      showToast("当前 Composer 为空。", "error");
      return;
    }
    closePanel();
    const context = captureComposerContext(entry.element, currentLocationHref(entry.element));
    const operation = { id: makeId("optimize"), method: "optimize", context };
    entry.operation = operation;
    state.activeOperations.set(operation.id, operation);
    updateButton(entry, true);

    try {
      if (state.settings.mode === "clarify") {
        state.panel = {
          kind: "clarify",
          original,
          context,
          locationHref: documentHref(),
          layout: createPanelLayout(state.panel?.layout ?? {}),
          round: 1,
          questions: [],
          answers: [],
          ready: false,
          busy: true,
          operationId: operation.id,
          operationMethod: "clarify-round",
          notice: "",
        };
        renderPanel();
        await runClarifyRound(state.panel);
        return;
      }

      if (state.settings.mode === "preview") {
        const useStreaming = state.settings.streaming !== false;
        showPreview({
          original,
          result: "",
          clarifications: [],
          mode: "preview",
          context,
          isStreaming: useStreaming,
        });
        if (state.panel) {
          state.panel.operationId = operation.id;
          state.panel.operationMethod = "optimize";
        }
        const response = await callNode("optimize", {
          operationId: operation.id,
          text: original,
          stream: useStreaming,
        });
        const finalResult = String(response.result ?? "").trim();
        showPreview({
          original,
          result: finalResult,
          clarifications: [],
          mode: "preview",
          context,
          isStreaming: false,
        });
        return;
      }

      // Direct Mode
      const response = await callNode("optimize", { operationId: operation.id, text: original });
      const result = String(response.result ?? "").trim();
      const currentContext = captureComposerContext(entry.element, currentLocationHref(entry.element));
      if (!isSameComposerContext(context, entry.element, currentContext.href, original)) {
        state.pendingResults.set(context.key, { context, result });
        if (state.pendingResults.size > 20) state.pendingResults.delete(state.pendingResults.keys().next().value);
        showToast("原 Composer 已变化，结果未自动写入。请回到原上下文后重新操作。", "error");
        return;
      }
      replaceInputText(entry.element, result);
      ensureRestoreButton(entry, { context, original, result });
      try {
        await persistAccepted({ original, result, mode: "direct" });
        showToast("提示词优化完成。", "success");
      } catch (error) {
        showToast(`优化完成，但历史保存失败：${error.message}`, "error");
      }
    } catch (error) {
      if (error.code !== "cancelled") {
        showToast(error.message, "error");
      }
    } finally {
      updateButton(entry, false);
      state.activeOperations.delete(operation.id);
      entry.operation = null;
    }
  };

  const renderPanel = () => {
    clearPanelInteractions();
    panelHost.replaceChildren();
    const panelState = state.panel;
    if (!panelState || state.disposed) return;

    const panel = element(doc, "section", {
      className: "ctpo-panel",
      role: "dialog",
      "aria-modal": "false",
      "aria-labelledby": "ctpo-panel-title",
      "data-ctpo-panel": "true",
    });
    const close = element(doc, "button", {
      type: "button",
      className: "ctpo-panel-close",
      "aria-label": "关闭面板",
      "data-ctpo-tooltip": "关闭面板 (Esc)",
    }, [svgIcon(doc, "close")]);
    close.addEventListener("click", closePanel);

    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePanel();
      } else if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        const applyBtn = panel.querySelector('[data-ctpo-action="apply-preview"]');
        if (applyBtn && !applyBtn.disabled) {
          event.preventDefault();
          applyBtn.click();
        }
      }
    });

    let tabGroup = null;
    if (panelState.kind === "preview") {
      tabGroup = element(doc, "div", { className: "ctpo-tab-group" });
      const tabs = [
        { id: "edit", label: "编辑" },
        { id: "markdown", label: "Markdown" },
        { id: "diff", label: "对比 (Diff)" },
      ];
      for (const t of tabs) {
        const tabBtn = element(doc, "button", {
          type: "button",
          className: "ctpo-tab-btn",
          "data-active": (panelState.viewTab || "edit") === t.id ? "true" : "false",
        }, [t.label]);
        tabBtn.addEventListener("click", () => {
          panelState.viewTab = t.id;
          renderPanel();
        });
        tabGroup.append(tabBtn);
      }
    }

    const titleEl = element(doc, "h2", { id: "ctpo-panel-title" }, [
      panelState.kind === "clarify" ? "澄清提示词" : "优化结果",
      panelState.isStreaming ? element(doc, "span", { className: "ctpo-streaming-tag", style: "margin-left: 8px;" }, ["⚡ 生成中..."]) : null,
    ]);

    const header = element(doc, "div", {
      className: "ctpo-panel-header",
      "data-ctpo-drag-handle": "true",
      tabindex: "0",
      "aria-label": "拖动预览窗口",
    }, [
      titleEl,
      tabGroup || element(doc, "span"),
      close,
    ]);

    const content = element(doc, "div", { className: `ctpo-panel-content ctpo-panel-${panelState.kind}` });
    const actions = element(doc, "div", { className: "ctpo-actions ctpo-panel-actions" });
    panel.append(header, content, actions);

    if (panelState.kind === "preview") {
      renderPreviewContent(content, actions, panelState);
    } else {
      renderClarifyContent(content, actions, panelState);
    }

    panelHost.append(panel);
    applyPanelGeometry(panel, panelState, { preservePosition: panelState.layout?.manual === true });
    installPanelInteractions(panel, panelState);
    const firstInput = panel.querySelector("textarea, input, button");
    firstInput?.focus?.();
  };

  const renderPreviewContent = (panel, actions, panelState) => {
    panel.append(element(doc, "p", { className: "ctpo-hint" }, [
      panelState.fromHistory
        ? "这是历史记录预览，不会自动覆盖当前 Composer。"
        : (panelState.isStreaming ? "正在实时生成优化提示词……" : "检查并编辑结果后，再决定是否应用 (快捷键 Ctrl+Enter 快速应用)。"),
    ]));

    panel.append(element(doc, "label", { className: "ctpo-label ctpo-panel-source-label" }, ["原始提示词"]));
    panel.append(element(doc, "div", { className: "ctpo-source" }, [panelState.original]));

    const resultLabel = element(doc, "label", { className: "ctpo-label ctpo-panel-result-label", for: "ctpo-preview-result" }, ["优化结果"]);
    panel.append(resultLabel);

    const viewTab = panelState.viewTab || "edit";
    if (viewTab === "markdown") {
      const md = renderSimpleMarkdown(doc, panelState.result);
      md.classList.add("ctpo-panel-result");
      panel.append(md);
    } else if (viewTab === "diff") {
      const diff = renderSimpleDiff(doc, panelState.original, panelState.result);
      diff.classList.add("ctpo-panel-result");
      panel.append(diff);
    } else {
      const result = element(doc, "textarea", { id: "ctpo-preview-result", className: "ctpo-panel-result", "aria-label": "可编辑的优化结果" }, [panelState.result]);
      result.addEventListener("input", () => { panelState.result = result.value; });
      panel.append(result);
    }

    const contextCurrent = panelState.context
      ? isSameComposerContext(panelState.context, panelState.context.element, currentLocationHref(panelState.context.element), panelState.original)
      : true;
    if (panelState.context && !contextCurrent) {
      panel.append(element(doc, "div", { className: "ctpo-status", role: "alert", "data-kind": "error" }, ["原 Composer 已变化。为避免覆盖新内容，应用按钮已停用。"]));
    }
    if (panelState.notice) {
      panel.append(element(doc, "div", { className: "ctpo-status" }, [panelState.notice]));
    }

    if (panelState.isStreaming) {
      const stopBtn = actionButton(doc, "停止生成", "stop-stream", { icon: "cancel", kind: "danger" });
      stopBtn.addEventListener("click", () => {
        if (panelState.operationId && panelState.operationMethod) {
          node?.invoke?.(panelState.operationMethod, { operationId: panelState.operationId, cancel: true }).catch?.(() => {});
        }
        panelState.isStreaming = false;
        renderPanel();
      });
      actions.append(stopBtn);
    }

    const apply = actionButton(doc, "应用结果", "apply-preview", { icon: "check", kind: "primary", disabled: Boolean(panelState.context && !contextCurrent) });
    apply.addEventListener("click", async () => {
      let target = panelState.context?.element;
      if (panelState.context) {
        if (!isSameComposerContext(panelState.context, target, currentLocationHref(target), panelState.original)) {
          renderPanel();
          return;
        }
      } else {
        target = currentComposer();
        if (!target) {
          panelState.notice = "当前页面没有可用的 Composer。";
          renderPanel();
          return;
        }
      }
      replaceInputText(target, panelState.result);
      try {
        await persistAccepted({ original: panelState.original, result: panelState.result, clarifications: panelState.clarifications, mode: panelState.mode });
        closePanel();
        showToast("已应用优化结果。", "success");
      } catch (error) {
        panelState.notice = `结果已应用，但历史保存失败：${error.message}`;
        renderPanel();
      }
    });

    const copy = actionButton(doc, "复制结果", "copy-preview", { icon: "copy" });
    copy.addEventListener("click", async () => {
      try {
        await copyText(panelState.result);
        await persistAccepted({ original: panelState.original, result: panelState.result, clarifications: panelState.clarifications, mode: panelState.mode });
        panelState.notice = "已复制，并已按明确接受动作保存历史。";
        renderPanel();
      } catch (error) {
        panelState.notice = error.message;
        renderPanel();
      }
    });

    actions.append(apply, copy, actionButton(doc, "取消", "cancel-preview", { icon: "cancel" }));
    actions.querySelector('[data-ctpo-action="cancel-preview"]').addEventListener("click", closePanel);
  };

  const renderClarifyContent = (panel, actions, panelState) => {
    panel.append(element(doc, "p", { className: "ctpo-hint" }, [`最多 3 轮，每轮最多 3 个问题。当前第 ${panelState.round} 轮；留空或跳过都可以。`]));
    panel.append(element(doc, "label", { className: "ctpo-label" }, ["原始提示词"]));
    panel.append(element(doc, "div", { className: "ctpo-source" }, [panelState.original]));
    if (panelState.notice) panel.append(element(doc, "div", { className: "ctpo-status", role: "alert", "data-kind": "error" }, [panelState.notice]));
    if (panelState.busy) {
      panel.append(element(doc, "div", { className: "ctpo-status" }, ["正在判断是否需要澄清……"]));
    } else if (panelState.questions.length) {
      const questions = element(doc, "div", { className: "ctpo-question-list" });
      panelState.questions.forEach((question, index) => {
        const input = element(doc, "textarea", { "data-ctpo-question-index": index, "aria-label": `澄清问题 ${index + 1}`, placeholder: "可留空或跳过" });
        questions.append(element(doc, "div", { className: "ctpo-question" }, [element(doc, "p", {}, [`${index + 1}. ${question}`]), input]));
      });
      panel.append(questions);
    } else if (panelState.ready) {
      panel.append(element(doc, "div", { className: "ctpo-status", "data-kind": "success" }, ["模型判断信息已足够。点击“生成预览”继续。"]));
    }
    if (!panelState.busy && panelState.questions.length) {
      const submitLabel = panelState.round >= 3 ? "提交回答并生成预览" : "提交回答";
      const submit = actionButton(doc, submitLabel, "submit-clarify", { icon: "check", kind: "primary" });
      submit.addEventListener("click", () => submitClarification(panelState));
      actions.append(submit);
      const skip = actionButton(doc, "跳过并生成预览", "skip-clarify", { icon: "cancel" });
      skip.addEventListener("click", () => generateClarifyResult(panelState));
      actions.append(skip);
    }
    if (!panelState.busy && (panelState.ready || panelState.round >= 3)) {
      const generate = actionButton(doc, "生成预览", "generate-clarify", { icon: "spark", kind: "primary" });
      generate.addEventListener("click", () => generateClarifyResult(panelState));
      actions.append(generate);
    }
    const cancel = actionButton(doc, "取消", "cancel-clarify", { icon: "cancel" });
    cancel.addEventListener("click", closePanel);
    actions.append(cancel);
  };

  const runClarifyRound = async (panelState) => {
    if (state.disposed || state.panel !== panelState) return;
    const operationId = makeId("clarify");
    panelState.operationId = operationId;
    panelState.operationMethod = "clarify-round";
    panelState.busy = true;
    state.activeOperations.set(operationId, { id: operationId, method: "clarify-round", context: panelState.context });
    renderPanel();
    try {
      const response = await callNode("clarify-round", {
        operationId,
        text: panelState.original,
        round: panelState.round,
        clarifications: panelState.answers,
      });
      if (state.panel !== panelState) return;
      panelState.questions = Array.isArray(response.questions) ? response.questions.slice(0, 3) : [];
      panelState.ready = response.readyToGenerate === true;
      panelState.busy = false;
      panelState.operationId = null;
      panelState.operationMethod = null;
      renderPanel();
    } catch (error) {
      if (state.panel !== panelState) return;
      panelState.busy = false;
      panelState.operationId = null;
      panelState.operationMethod = null;
      if (error.code !== "cancelled") panelState.notice = error.message;
      renderPanel();
    } finally {
      state.activeOperations.delete(operationId);
    }
  };

  const collectClarificationAnswers = (panelState) => {
    return [...panelHost.querySelectorAll("[data-ctpo-question-index]")].map((input, index) => ({
      question: panelState.questions[index] ?? "",
      answer: input.value ?? "",
    }));
  };

  const submitClarification = async (panelState) => {
    if (state.panel !== panelState || panelState.busy) return;
    panelState.answers.push(...collectClarificationAnswers(panelState));
    if (panelState.round >= 3) {
      await generateClarifyResult(panelState);
      return;
    }
    panelState.round += 1;
    panelState.questions = [];
    panelState.ready = false;
    await runClarifyRound(panelState);
  };

  const generateClarifyResult = async (panelState) => {
    if (state.panel !== panelState || panelState.busy) return;
    panelState.answers.push(...collectClarificationAnswers(panelState));
    panelState.busy = true;
    const operationId = makeId("clarify-final");
    panelState.operationId = operationId;
    panelState.operationMethod = "optimize";
    state.activeOperations.set(operationId, { id: operationId, method: "optimize", context: panelState.context });
    renderPanel();
    try {
      const response = await callNode("optimize", {
        operationId,
        text: panelState.original,
        clarifications: panelState.answers,
      });
      if (state.panel !== panelState) return;
      showPreview({
        original: panelState.original,
        result: String(response.result ?? "").trim(),
        clarifications: panelState.answers,
        mode: "clarify",
        context: panelState.context,
        layout: panelState.layout,
      });
    } catch (error) {
      if (state.panel !== panelState) return;
      panelState.busy = false;
      panelState.operationId = null;
      panelState.operationMethod = null;
      if (error.code !== "cancelled") panelState.notice = error.message;
      renderPanel();
    }
  };

  const attachComposer = (composer) => {
    if (state.attached.has(composer) || composer.closest?.(`[${ROOT_ATTRIBUTE}]`)) return;
    const anchor = findComposerActionAnchor(composer);
    if (!anchor?.parentElement) return;

    const button = element(doc, "button", {
      type: "button",
      className: BUTTON_CLASS,
      "aria-label": "优化当前提示词",
      "data-ctpo-tooltip": "优化当前提示词",
      "data-codex-tweaks-prompt-optimizer": "button",
      hidden: true,
    }, [svgIcon(doc, "spark"), "优化"]);

    const menuButton = element(doc, "button", {
      type: "button",
      className: "ct-prompt-optimizer-menu-button",
      "aria-label": "打开提示词优化菜单",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      "data-ctpo-tooltip": "提示词优化菜单",
      hidden: true,
    }, [svgIcon(doc, "chevron")]);

    const entry = { element: composer, anchor, button, menuButton, restoreButton: null, operation: null, busy: false, lastPos: null, lastAnchorRect: null };
    entry.debugPasteListener = () => {
      if (state.debugGeometry) {
        recordGeometry(entry, "paste-event", entry.anchor);
        scheduleScan();
      }
    };
    entry.debugInputListener = () => {
      if (state.debugGeometry) {
        recordGeometry(entry, "input-event", entry.anchor);
        scheduleScan();
      }
    };
    composer.addEventListener?.("paste", entry.debugPasteListener);
    composer.addEventListener?.("input", entry.debugInputListener);
    button.addEventListener("click", () => startOptimization(entry));
    menuButton.addEventListener("click", () => openComposerMenu(entry));

    placeComposerButton(entry, anchor, { previousAnchor: null, phase: "attach" });
    state.attached.set(composer, entry);
  };

  const detachComposer = (entry) => {
    entry.element.removeEventListener?.("paste", entry.debugPasteListener);
    entry.element.removeEventListener?.("input", entry.debugInputListener);
    entry.button.remove();
    entry.menuButton?.remove();
    entry.restoreButton?.remove();
    if (state.latestRestoreEntry === entry) {
      state.latestRestoreEntry = null;
      state.latestSnapshot = null;
    }
    if (state.composerMenu?.entry === entry) closeComposerMenu();
    state.attached.delete(entry.element);
  };

  const scanComposers = () => {
    if (state.disposed) return;
    if (!state.settings.enabled) {
      for (const entry of state.attached.values()) {
        entry.button.hidden = true;
        if (entry.menuButton) entry.menuButton.hidden = true;
        if (entry.restoreButton) entry.restoreButton.hidden = true;
      }
      return;
    }
    for (const entry of [...state.attached.values()]) {
      if (!entry.element.isConnected) detachComposer(entry);
      else {
        const previousAnchor = entry.anchor;
        const nextAnchor = findComposerActionAnchor(entry.element, entry.anchor);
        if (nextAnchor && nextAnchor !== entry.anchor) placeComposerButton(entry, nextAnchor, { previousAnchor, phase: "scan-anchor-change" });
        else if (nextAnchor) positionComposerButton(entry, { previousAnchor, phase: "scan" });
        else {
          entry.button.hidden = true;
          if (entry.menuButton) entry.menuButton.hidden = true;
          if (entry.restoreButton) entry.restoreButton.hidden = true;
          recordGeometry(entry, "scan:no-anchor", previousAnchor);
        }
      }
    }
    for (const composer of findComposerCandidates(doc)) attachComposer(composer);
  };

  const scheduleScan = () => {
    if (state.scanTimer || state.disposed) return;
    state.scanTimer = setTimeout(() => {
      state.scanTimer = null;
      if (typeof doc.defaultView?.requestAnimationFrame === "function") {
        if (state.scanRaf) cancelAnimationFrame(state.scanRaf);
        state.scanRaf = doc.defaultView.requestAnimationFrame(() => {
          state.scanRaf = null;
          scanComposers();
        });
      } else {
        scanComposers();
      }
    }, 80);
  };

  const setDebugGeometry = (enabled) => {
    state.debugGeometry = Boolean(enabled);
    refreshDebugOutputViews();
    if (state.debugGeometry) {
      setNotice("临时定位诊断已开启，仅记录几何和控件标识，不记录输入内容。", "success");
      scheduleScan();
    } else {
      setNotice("临时定位诊断已关闭；现有诊断记录仍保留在本次会话中。");
    }
  };

  const reflowComposerButtons = (event) => {
    if (state.disposed) return;
    const scroller = event?.target;
    const isGlobalScroll = !scroller
      || scroller === doc
      || scroller === doc.defaultView
      || scroller === doc.documentElement
      || scroller === doc.body;
    for (const entry of state.attached.values()) {
      if (!isGlobalScroll && (isExcludedFromComposer(scroller) || !scroller.contains?.(entry.anchor))) continue;
      const previousAnchor = entry.anchor;
      const nextAnchor = findComposerActionAnchor(entry.element, entry.anchor);
      if (!nextAnchor) {
        entry.button.hidden = true;
        if (entry.menuButton) entry.menuButton.hidden = true;
        if (entry.restoreButton) entry.restoreButton.hidden = true;
        recordGeometry(entry, "reflow:no-anchor", previousAnchor);
      } else if (nextAnchor !== entry.anchor) {
        placeComposerButton(entry, nextAnchor, { previousAnchor, phase: "reflow-anchor-change" });
      } else {
        positionComposerButton(entry, { previousAnchor, phase: "reflow" });
      }
    }
  };

  const renderHistory = (view, listContainer, searchQuery = "") => {
    listContainer.replaceChildren();
    if (!view.selectedHistoryIds) view.selectedHistoryIds = new Set();

    // Auto-sort history: Pinned items first (newest to oldest), then unpinned (newest to oldest)
    state.history.sort((a, b) => {
      const aPin = Boolean(a?.isPinned);
      const bPin = Boolean(b?.isPinned);
      if (aPin !== bPin) return aPin ? -1 : 1;
      return new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime();
    });

    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? state.history.filter((e) => e.original.toLowerCase().includes(query) || e.result.toLowerCase().includes(query))
      : state.history;

    if (!filtered.length) {
      listContainer.append(element(doc, "li", { className: "ctpo-hint" }, [
        query ? "没有匹配的优化历史。" : (state.settings.historyLimit === 0 ? "历史保留设置为 0。" : "暂无优化历史。"),
      ]));
      return;
    }

    // Batch Action Bar
    const batchBar = element(doc, "div", { className: "ctpo-history-batch-bar" });
    const selectAllCheck = element(doc, "input", {
      type: "checkbox",
      className: "ctpo-history-checkbox",
      "aria-label": "全选历史记录",
      checked: filtered.length > 0 && filtered.every((e) => view.selectedHistoryIds.has(e.id)),
    });
    selectAllCheck.addEventListener("change", () => {
      if (selectAllCheck.checked) {
        for (const e of filtered) view.selectedHistoryIds.add(e.id);
      } else {
        for (const e of filtered) view.selectedHistoryIds.delete(e.id);
      }
      renderHistory(view, listContainer, searchQuery);
    });

    const selectedCount = [...view.selectedHistoryIds].filter((id) => filtered.some((e) => e.id === id)).length;
    const batchLeft = element(doc, "div", { className: "ctpo-history-batch-left" }, [
      selectAllCheck,
      element(doc, "span", {}, [selectedCount > 0 ? `已选 ${selectedCount} 项` : "全选"]),
    ]);

    const batchActions = element(doc, "div", { className: "ctpo-history-batch-actions" });

    if (selectedCount > 0) {
      const batchPinBtn = actionButton(doc, "批量收藏", "batch-pin-history", { icon: "star", title: "将选中的记录批量收藏并置顶" });
      batchPinBtn.addEventListener("click", async () => {
        try {
          for (const id of view.selectedHistoryIds) {
            await callNode("toggle-pin-history", { id, pin: true });
            const item = state.history.find((e) => e.id === id);
            if (item) item.isPinned = true;
          }
          view.selectedHistoryIds.clear();
          renderHistory(view, listContainer, searchQuery);
        } catch (e) {
          setNotice(e.message, "error");
        }
      });

      const batchDeleteBtn = actionButton(doc, "批量删除", "batch-delete-history", { icon: "trash", kind: "danger", title: "删除所有选中的记录" });
      batchDeleteBtn.addEventListener("click", () => {
        showModalDialog({
          doc,
          title: "批量删除历史记录",
          message: `确认删除选中的 ${selectedCount} 条优化历史记录吗？该操作不可撤销。`,
          confirmText: "确认删除",
          isDanger: true,
          onConfirm: async () => {
            try {
              for (const id of view.selectedHistoryIds) {
                await callNode("delete-history", { id });
                state.history = state.history.filter((item) => item.id !== id);
              }
              view.selectedHistoryIds.clear();
              renderHistory(view, listContainer, searchQuery);
            } catch (e) {
              setNotice(e.message, "error");
            }
          },
        });
      });

      batchActions.append(batchPinBtn, batchDeleteBtn);
    }

    batchBar.append(batchLeft, batchActions);
    listContainer.append(batchBar);

    const ul = element(doc, "ul", { className: "ctpo-history-list" });
    const fragment = doc.createDocumentFragment ? doc.createDocumentFragment() : ul;

    for (const entry of filtered) {
      const isPinned = Boolean(entry.isPinned);
      const isChecked = view.selectedHistoryIds.has(entry.id);

      const check = element(doc, "input", {
        type: "checkbox",
        className: "ctpo-history-checkbox",
        checked: isChecked,
      });
      check.addEventListener("change", () => {
        if (check.checked) view.selectedHistoryIds.add(entry.id);
        else view.selectedHistoryIds.delete(entry.id);
        renderHistory(view, listContainer, searchQuery);
      });

      const preview = element(doc, "div", { className: "ctpo-history-copy", title: "" }, [
        element(doc, "div", { className: "ctpo-history-preview" }, [
          isPinned ? element(doc, "span", { className: "ctpo-pinned-badge" }, ["⭐ 已收藏"]) : null,
          entry.original,
        ]),
        element(doc, "div", { className: "ctpo-history-date" }, [new Date(entry.createdAt).toLocaleString()]),
      ]);

      let hoverTimer = null;
      let mountedHoverCard = null;

      const onPointerEnter = () => {
        if (hoverTimer) {
          clearTimeout(hoverTimer);
          hoverTimer = null;
        }
        for (const card of preview.querySelectorAll?.(".ctpo-history-hover-card") ?? []) {
          card.remove();
        }
        if (mountedHoverCard) {
          mountedHoverCard.remove();
          mountedHoverCard = null;
        }

        hoverTimer = setTimeout(() => {
          hoverTimer = null;
          let isConnected = preview.isConnected !== false;
          let curr = preview;
          while (curr && isConnected) {
            if (curr.isConnected === false) { isConnected = false; break; }
            if (!curr.parentElement) {
              if (curr.tagName === "UL" || curr.tagName === "LI") {
                isConnected = false;
              }
              break;
            }
            curr = curr.parentElement;
          }
          if (!isConnected || !preview.parentElement) return;
          mountedHoverCard = element(doc, "div", { className: "ctpo-history-hover-card" }, [
            element(doc, "div", { className: "ctpo-history-hover-title" }, ["📝 原始提示词："]),
            element(doc, "div", { className: "ctpo-history-hover-text" }, [entry.original]),
            element(doc, "div", { className: "ctpo-history-hover-title", style: "margin-top: 6px;" }, ["✨ 优化结果预览："]),
            element(doc, "div", { className: "ctpo-history-hover-text" }, [entry.result.length > 260 ? `${entry.result.slice(0, 260)}...` : entry.result]),
          ]);
          preview.append(mountedHoverCard);
        }, 120);
      };

      const onPointerLeave = () => {
        if (hoverTimer) {
          clearTimeout(hoverTimer);
          hoverTimer = null;
        }
        for (const card of preview.querySelectorAll?.(".ctpo-history-hover-card") ?? []) {
          card.remove();
        }
        if (mountedHoverCard) {
          mountedHoverCard.remove();
          mountedHoverCard = null;
        }
      };

      preview.addEventListener("pointerenter", onPointerEnter);
      preview.addEventListener("pointerleave", onPointerLeave);

      const pinBtn = actionButton(doc, isPinned ? "已收藏" : "收藏", "toggle-pin-history", {
        icon: isPinned ? "starFilled" : "star",
        title: isPinned ? "取消收藏" : "收藏并默认置顶（不受数量清理限制）",
      });
      pinBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          const res = await callNode("toggle-pin-history", { id: entry.id });
          if (Array.isArray(res.entries)) {
            state.history = res.entries;
          } else {
            entry.isPinned = res.isPinned;
          }
          renderHistory(view, listContainer, searchQuery);
        } catch (error) {
          setNotice(error.message, "error");
        }
      });

      const previewBtn = actionButton(doc, "预览", "history-preview", { icon: "eye" });
      previewBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showPreview({
          original: entry.original,
          result: entry.result,
          clarifications: entry.clarifications,
          mode: entry.mode,
          context: null,
          fromHistory: true,
        });
      });

      const delBtn = actionButton(doc, "删除", "history-delete", { icon: "trash", kind: "danger" });
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showModalDialog({
          doc,
          title: "删除历史记录",
          message: "确认删除此条优化历史记录吗？该操作不可撤销。",
          confirmText: "确认删除",
          isDanger: true,
          onConfirm: async () => {
            try {
              await callNode("delete-history", { id: entry.id });
              state.history = state.history.filter((item) => item.id !== entry.id);
              view.selectedHistoryIds.delete(entry.id);
              renderHistory(view, listContainer, searchQuery);
            } catch (error) {
              setNotice(error.message, "error");
            }
          },
        });
      });

      const actions = element(doc, "div", { className: "ctpo-actions ctpo-history-item-actions" }, [
        pinBtn,
        previewBtn,
        delBtn,
      ]);

      const itemEl = element(doc, "li", {
        className: "ctpo-history-item",
        "data-pinned": isPinned ? "true" : "false",
      }, [
        check,
        preview,
        actions,
      ]);

      preview.addEventListener("click", (e) => {
        if (e.target === check) return;
        itemEl.setAttribute("data-expanded", itemEl.getAttribute("data-expanded") === "true" ? "false" : "true");
      });

      fragment.append(itemEl);
    }
    if (fragment !== ul) ul.append(fragment);
    listContainer.append(ul);
  };

  const buildSettingsView = (container, { embedded = false } = {}) => {
    const view = {
      id: makeId("settings"),
      container,
      status: null,
      saveFeedback: null,
      presetFeedback: null,
      inlineNotice: { text: "", kind: "" },
      modelOptions: [],
      keyDraft: "",
      keyVisible: false,
      busy: false,
      debugOutput: null,
      historySearch: "",
      selectedHistoryIds: new Set(),
      searchTimer: null,
      render: null,
    };
    const setInlineNotice = (text, kind = "") => {
      view.inlineNotice = { text, kind };
      if (view.saveFeedback) {
        view.saveFeedback.textContent = text;
        view.saveFeedback.dataset.kind = kind;
      }
      if (state.notice.text) setNotice("");
    };
    container.setAttribute(ROOT_ATTRIBUTE, "");

    view.render = () => {
      if (state.disposed) return;
      const settings = state.settings;
      container.replaceChildren();
      const wrapper = element(doc, "main", { className: "ctpo-settings" });
      const header = element(doc, "header", { className: "ctpo-pane-header" }, [
        element(doc, "h1", { className: "ctpo-title" }, ["提示词优化"]),
        element(doc, "p", { className: "ctpo-description" }, ["只处理当前 Composer 中的提示词，并通过你指定的 API 生成可直接使用的优化结果。不会读取会话历史、文件、附件或项目上下文。"]),
      ]);
      if (!embedded) wrapper.append(header);

      // Card 1: 基本设置
      const generalCard = element(doc, "section", { className: "ctpo-card", "aria-labelledby": `${view.id}-general` });
      generalCard.append(element(doc, "h2", { id: `${view.id}-general` }, ["基本设置"]));
      
      const switchLabel = element(doc, "label", { className: "ctpo-switch-row" });
      const switchCopy = element(doc, "span", {}, [
        element(doc, "span", { className: "ctpo-label" }, ["启用优化按钮"]),
        element(doc, "span", { className: "ctpo-hint" }, ["包启用后，控制 Composer 附近的入口。首次启用默认开启。"]),
      ]);
      const enabled = element(doc, "input", { type: "checkbox", className: "ctpo-switch", role: "switch", "aria-label": "启用优化按钮", checked: settings.enabled });
      enabled.addEventListener("change", () => {
        state.settings.enabled = enabled.checked;
        scheduleScan();
      });
      switchLabel.append(switchCopy, enabled);

      const streamLabel = element(doc, "label", { className: "ctpo-switch-row", style: "margin-top: 8px;" });
      const streamCopy = element(doc, "span", {}, [
        element(doc, "span", { className: "ctpo-label" }, ["启用流式响应 (Streaming)"]),
        element(doc, "span", { className: "ctpo-hint" }, ["打字机实时展示大模型输出；若目标模型或反代不支持流式传输，可关闭此项。"]),
      ]);
      const streamSwitch = element(doc, "input", { type: "checkbox", className: "ctpo-switch", role: "switch", "aria-label": "启用流式响应", checked: settings.streaming !== false });
      streamSwitch.addEventListener("change", () => {
        state.settings.streaming = streamSwitch.checked;
      });
      streamLabel.append(streamCopy, streamSwitch);
      generalCard.append(switchLabel, streamLabel);

      // Card 2: Provider 档案管理
      const profiles = Array.isArray(settings.profiles) && settings.profiles.length ? settings.profiles : [
        { id: "default-profile", name: "默认配置", protocol: settings.protocol, baseUrl: settings.baseUrl, model: settings.model },
      ];
      const activeProfileId = settings.activeProfileId || profiles[0].id;
      const currentProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0];

      const profileCard = element(doc, "section", { className: "ctpo-card", "aria-labelledby": `${view.id}-profiles` });
      profileCard.append(element(doc, "h2", { id: `${view.id}-profiles` }, ["Provider 档案 (多配置快速切换)"]));
      
      const profileLine = element(doc, "div", { className: "ctpo-inline", style: "gap: 8px; margin-bottom: 4px;" });
      const profileSelect = element(doc, "select", { "aria-label": "选择配置档案", style: "flex: 1; min-width: 140px;" });
      for (const p of profiles) {
        profileSelect.append(element(doc, "option", { value: p.id, textContent: p.name || p.id }));
      }
      profileSelect.value = activeProfileId;
      profileSelect.addEventListener("change", async () => {
        setViewBusy(view, true);
        try {
          const res = await callNode("select-profile", { profileId: profileSelect.value });
          state.settings = { ...state.settings, ...res.settings };
          view.keyDraft = "";
          setInlineNotice(`已切换到【${profiles.find((p) => p.id === profileSelect.value)?.name}】`, "success");
          view.render();
        } catch (e) {
          setInlineNotice(e.message, "error");
        } finally {
          setViewBusy(view, false);
        }
      });

      const addProfileBtn = actionButton(doc, "+ 新增档案", "add-profile", { icon: "spark", title: "添加新模型 Provider 档案" });
      addProfileBtn.addEventListener("click", () => {
        showModalDialog({
          doc,
          title: "新增 Provider 档案",
          message: "请输入新配置档案的名称（例如：DeepSeek、Claude、本地 Ollama 等）：",
          showInput: true,
          inputPlaceholder: "例如：DeepSeek 官方 API",
          initialValue: "新模型配置",
          confirmText: "创建档案",
          onConfirm: async (name) => {
            if (!name) return;
            const newProf = {
              id: `profile-${Date.now()}`,
              name,
              protocol: "openaiResponses",
              baseUrl: "",
              apiKey: "",
              model: "",
              streaming: true,
            };
            setViewBusy(view, true);
            try {
              const res = await callNode("save-profile", { profile: newProf });
              await callNode("select-profile", { profileId: newProf.id });
              state.settings = { ...state.settings, ...res.settings, activeProfileId: newProf.id };
              view.keyDraft = "";
              setInlineNotice(`已创建并切换到【${name}】`, "success");
              view.render();
            } catch (e) {
              setInlineNotice(e.message, "error");
            } finally {
              setViewBusy(view, false);
            }
          },
        });
      });

      const renameProfileBtn = actionButton(doc, "重命名", "rename-profile", { icon: "edit", title: "重命名当前选中的档案" });
      renameProfileBtn.addEventListener("click", () => {
        showModalDialog({
          doc,
          title: "重命名配置档案",
          message: `修改档案【${currentProfile.name}】的名称：`,
          showInput: true,
          initialValue: currentProfile.name,
          confirmText: "保存名称",
          onConfirm: async (newName) => {
            if (!newName || newName === currentProfile.name) return;
            setViewBusy(view, true);
            try {
              const updatedProfile = { ...currentProfile, name: newName };
              const res = await callNode("save-profile", { profile: updatedProfile });
              state.settings = { ...state.settings, ...res.settings };
              setInlineNotice(`已重命名为【${newName}】`, "success");
              view.render();
            } catch (e) {
              setInlineNotice(e.message, "error");
            } finally {
              setViewBusy(view, false);
            }
          },
        });
      });

      const delProfileBtn = actionButton(doc, "删除档案", "delete-profile", { icon: "trash", kind: "danger", title: "删除当前选中的档案" });
      delProfileBtn.addEventListener("click", () => {
        if (profiles.length <= 1) {
          setInlineNotice("至少保留一个配置档案，无法删除。", "error");
          return;
        }
        showModalDialog({
          doc,
          title: "删除配置档案",
          message: `确认删除当前配置档案【${currentProfile.name}】吗？该操作不可撤销。`,
          confirmText: "确认删除",
          isDanger: true,
          onConfirm: async () => {
            setViewBusy(view, true);
            try {
              const res = await callNode("delete-profile", { profileId: currentProfile.id });
              state.settings = { ...state.settings, ...res.settings };
              view.keyDraft = "";
              setInlineNotice(`档案【${currentProfile.name}】已删除。`, "success");
              view.render();
            } catch (e) {
              setInlineNotice(e.message, "error");
            } finally {
              setViewBusy(view, false);
            }
          },
        });
      });

      profileLine.append(profileSelect, addProfileBtn, renameProfileBtn, delProfileBtn);
      profileCard.append(profileLine);

      // Card 3: 当前档案 API 设置
      const providerCard = element(doc, "section", { className: "ctpo-card", "aria-labelledby": `${view.id}-provider` });
      providerCard.append(element(doc, "h2", { id: `${view.id}-provider` }, [`当前档案 API 设置（${currentProfile.name || "当前配置"}）`]));
      const grid = element(doc, "div", { className: "ctpo-grid" });

      const modeSelect = element(doc, "select", { id: createSettingsId(view, "mode"), "aria-describedby": createSettingsId(view, "mode-hint") });
      for (const [value, label] of MODE_OPTIONS) modeSelect.append(element(doc, "option", { value, textContent: label }));
      modeSelect.value = settings.mode;
      modeSelect.addEventListener("change", () => { state.settings.mode = modeSelect.value; });
      grid.append(field(doc, "运行模式", modeSelect, "每次请求都只使用当前 Composer 内容。", createSettingsId(view, "mode-hint")));

      const protocolSelect = element(doc, "select", { id: createSettingsId(view, "protocol") });
      for (const [value, label] of PROTOCOL_OPTIONS) protocolSelect.append(element(doc, "option", { value, textContent: label }));
      protocolSelect.value = settings.protocol;
      protocolSelect.addEventListener("change", () => { state.settings.protocol = protocolSelect.value; });
      grid.append(field(doc, "API 协议", protocolSelect, "支持 OpenAI Responses、Chat Completions 和 Anthropic Messages。"));

      const baseUrl = element(doc, "input", { id: createSettingsId(view, "base-url"), type: "url", autocomplete: "url", placeholder: "https://api.example.com/v1" });
      baseUrl.value = settings.baseUrl;
      baseUrl.addEventListener("input", () => { state.settings.baseUrl = baseUrl.value; });
      const baseUrlField = field(doc, "API 地址", baseUrl, "远程服务必须使用 HTTPS；localhost、127.0.0.1 和 ::1 可使用 HTTP。");
      baseUrlField.classList.add("ctpo-field-full");
      grid.append(baseUrlField);

      const keyInput = element(doc, "input", { id: createSettingsId(view, "api-key"), type: view.keyVisible ? "text" : "password", autocomplete: "new-password", placeholder: settings.apiKeyConfigured ? "已配置，留空表示保持不变" : "输入 API Key" });
      keyInput.value = view.keyDraft;
      keyInput.addEventListener("input", () => { view.keyDraft = keyInput.value; });
      const keyToggle = actionButton(doc, view.keyVisible ? "隐藏" : "显示", "toggle-key", { icon: "eye", title: "显示或隐藏 API Key" });
      keyToggle.addEventListener("click", () => { view.keyVisible = !view.keyVisible; view.render(); });
      const keyLine = element(doc, "div", { className: "ctpo-inline" }, [keyInput, keyToggle]);
      const keyField = field(doc, "API Key", keyLine, "界面默认遮蔽；显示/隐藏只作用于当前输入草稿，已保存 Key 不回显。此包不宣称操作系统级加密。");
      keyField.classList.add("ctpo-field-full");
      grid.append(keyField);

      const modelInput = element(doc, "input", { id: createSettingsId(view, "model"), type: "text", autocomplete: "off", placeholder: "例如 gpt-5.6", "aria-label": "手动填写模型名称" });
      modelInput.value = settings.model;
      const modelSelect = element(doc, "select", {
        className: "ctpo-model-select",
        "aria-label": "选择已获取模型",
        disabled: view.modelOptions.length === 0,
      });
      modelSelect.append(element(doc, "option", {
        value: "",
        textContent: view.modelOptions.length ? "选择已获取模型" : "请先获取模型",
      }));
      for (const model of view.modelOptions) modelSelect.append(element(doc, "option", { value: model, textContent: model }));
      modelSelect.value = view.modelOptions.includes(settings.model) ? settings.model : "";
      modelInput.addEventListener("input", () => {
        state.settings.model = modelInput.value;
        modelSelect.value = view.modelOptions.includes(modelInput.value) ? modelInput.value : "";
      });
      modelSelect.addEventListener("change", () => {
        if (!modelSelect.value) return;
        state.settings.model = modelSelect.value;
        modelInput.value = modelSelect.value;
      });
      const modelsButton = actionButton(doc, "获取模型", "list-models", { icon: "refresh", title: "请求 Provider 的模型列表" });
      modelsButton.addEventListener("click", async () => {
        setViewBusy(view, true);
        setInlineNotice("正在获取模型列表……");
        try {
          const response = await callNode("list-models", { settings: { ...state.settings, apiKey: view.keyDraft } });
          view.modelOptions = modelOptionValues(response.models);
          setInlineNotice(`已获取 ${view.modelOptions.length} 个模型。`, "success");
          view.render();
        } catch (error) {
          setInlineNotice(`${error.message} 仍可手动填写模型名称。`, "error");
        } finally {
          setViewBusy(view, false);
        }
      });
      const modelLine = element(doc, "div", { className: "ctpo-inline ctpo-model-line" }, [modelInput, modelSelect, modelsButton]);
      const modelField = field(doc, "模型名称", modelLine, "获取模型后可从下拉框选择，也可手动填写模型名称。");
      modelField.classList.add("ctpo-field-full");
      grid.append(modelField);
      providerCard.append(grid);

      // API Settings 操作按钮
      const apiActions = element(doc, "div", { className: "ctpo-actions", style: "margin-top: 14px; border-top: 1px solid var(--ctpo-border); padding-top: 12px;" });
      const save = actionButton(doc, "保存配置", "save-settings", { icon: "check", kind: "primary" });
      save.addEventListener("click", async () => {
        setViewBusy(view, true);
        setInlineNotice("正在保存配置……");
        try {
          const response = await callNode("save-settings", { settings: { ...state.settings, apiKey: view.keyDraft } });
          state.settings = { ...RENDERER_DEFAULTS, ...response.settings, apiKey: "" };
          view.keyDraft = "";
          setInlineNotice("配置已保存。", "success");
          view.render();
          scheduleScan();
        } catch (error) {
          setInlineNotice(error.message, "error");
        } finally {
          setViewBusy(view, false);
        }
      });
      const clearKey = actionButton(doc, "清除 Key", "clear-api-key", { icon: "trash", kind: "danger" });
      clearKey.addEventListener("click", async () => {
        setViewBusy(view, true);
        setInlineNotice("正在清除 API Key……");
        try {
          const response = await callNode("clear-api-key");
          state.settings = { ...state.settings, ...response.settings };
          view.keyDraft = "";
          setInlineNotice("API Key 已清除。", "success");
          view.render();
        } catch (error) {
          setInlineNotice(error.message, "error");
        } finally {
          setViewBusy(view, false);
        }
      });
      const test = actionButton(doc, "测试连接", "test-connection", { icon: "spark" });
      test.addEventListener("click", async () => {
        setViewBusy(view, true);
        setInlineNotice("正在测试连接……");
        try {
          const response = await callNode("test-connection", { settings: { ...state.settings, apiKey: view.keyDraft } });
          setInlineNotice(`${response.message}（${response.responseType === "text" ? "模型文本响应" : "JSON 响应"}）`, "success");
        } catch (error) {
          setInlineNotice(error.message, "error");
        } finally {
          setViewBusy(view, false);
        }
      });
      const saveFeedback = element(doc, "span", { className: "ctpo-save-feedback", role: "status", "aria-live": "polite" });
      saveFeedback.textContent = view.inlineNotice.text;
      saveFeedback.dataset.kind = view.inlineNotice.kind;
      view.saveFeedback = saveFeedback;
      apiActions.append(save, clearKey, test, saveFeedback);
      providerCard.append(apiActions);

      // Card 4: 场景优化预设 & 指令
      const presetCard = element(doc, "section", { className: "ctpo-card", "aria-labelledby": `${view.id}-presets` });
      presetCard.append(element(doc, "h2", { id: `${view.id}-presets` }, ["场景优化预设 & 指令"]));

      const presetsList = Array.isArray(settings.presets) && settings.presets.length
        ? settings.presets
        : [
          { id: "general", name: "通用优化", instruction: RENDERER_DEFAULTS.instruction },
          { id: "code", name: "编程开发" },
          { id: "concise", name: "精准精简" },
          { id: "cot", name: "深度推理 (CoT)" },
          { id: "translate", name: "中英转译" },
        ];
      const activePresetId = settings.activePresetId || "general";
      const currentPreset = presetsList.find((p) => p.id === activePresetId) || presetsList[0];

      const presetSelectLine = element(doc, "div", { className: "ctpo-inline", style: "gap: 8px; margin-bottom: 8px;" });
      const presetSelect = element(doc, "select", { "aria-label": "选择场景预设", style: "flex: 1; min-width: 140px;" });
      for (const p of presetsList) {
        presetSelect.append(element(doc, "option", { value: p.id, textContent: p.name }));
      }
      presetSelect.value = activePresetId;
      presetSelect.addEventListener("change", async () => {
        try {
          const res = await callNode("select-preset", { presetId: presetSelect.value });
          state.settings = { ...state.settings, ...res.settings };
          setInlineNotice(`已应用【${presetsList.find((p) => p.id === presetSelect.value)?.name}】预设指令`, "success");
          view.render();
        } catch (e) {
          setInlineNotice(e.message, "error");
        }
      });

      const addPresetBtn = actionButton(doc, "+ 新增预设", "add-preset", { icon: "spark", title: "添加自定义场景预设" });
      addPresetBtn.addEventListener("click", () => {
        showModalDialog({
          doc,
          title: "新增场景预设",
          message: "请输入新预设的名称（例如：SQL 调优、UI 设计、文案润色 等）：",
          showInput: true,
          inputPlaceholder: "例如：代码重构",
          initialValue: "自定义预设",
          confirmText: "创建预设",
          onConfirm: async (name) => {
            if (!name) return;
            const newPreset = {
              id: `preset-${Date.now()}`,
              name,
              instruction: state.settings.instruction || RENDERER_DEFAULTS.instruction,
            };
            setViewBusy(view, true);
            try {
              const res = await callNode("save-preset", { preset: newPreset });
              await callNode("select-preset", { presetId: newPreset.id });
              state.settings = { ...state.settings, ...res.settings, activePresetId: newPreset.id, instruction: newPreset.instruction };
              setInlineNotice(`已创建并切换到【${name}】预设`, "success");
              view.render();
            } catch (e) {
              setInlineNotice(e.message, "error");
            } finally {
              setViewBusy(view, false);
            }
          },
        });
      });

      const renamePresetBtn = actionButton(doc, "重命名", "rename-preset", { icon: "edit", title: "重命名当前选中的场景预设" });
      renamePresetBtn.addEventListener("click", () => {
        showModalDialog({
          doc,
          title: "重命名场景预设",
          message: `修改预设【${currentPreset.name}】的名称：`,
          showInput: true,
          initialValue: currentPreset.name,
          confirmText: "保存名称",
          onConfirm: async (newName) => {
            if (!newName || newName === currentPreset.name) return;
            setViewBusy(view, true);
            try {
              const updated = { ...currentPreset, name: newName };
              const res = await callNode("save-preset", { preset: updated });
              state.settings = { ...state.settings, ...res.settings };
              setInlineNotice(`预设已重命名为【${newName}】`, "success");
              view.render();
            } catch (e) {
              setInlineNotice(e.message, "error");
            } finally {
              setViewBusy(view, false);
            }
          },
        });
      });

      const delPresetBtn = actionButton(doc, "删除预设", "delete-preset", { icon: "trash", kind: "danger", title: "删除当前选中的场景预设" });
      delPresetBtn.addEventListener("click", () => {
        if (presetsList.length <= 1) {
          setInlineNotice("至少保留一个场景预设，无法删除。", "error");
          return;
        }
        showModalDialog({
          doc,
          title: "删除场景预设",
          message: `确认删除场景预设【${currentPreset.name}】吗？该操作不可撤销。`,
          confirmText: "确认删除",
          isDanger: true,
          onConfirm: async () => {
            setViewBusy(view, true);
            try {
              const res = await callNode("delete-preset", { presetId: currentPreset.id });
              state.settings = { ...state.settings, ...res.settings };
              setInlineNotice(`预设【${currentPreset.name}】已删除。`, "success");
              view.render();
            } catch (e) {
              setInlineNotice(e.message, "error");
            } finally {
              setViewBusy(view, false);
            }
          },
        });
      });

      presetSelectLine.append(presetSelect, addPresetBtn, renamePresetBtn, delPresetBtn);
      presetCard.append(field(doc, "选择场景预设", presetSelectLine, "可切换或新建编程、精简、思维链推导、转译等自定义优化预设。"));

      const instruction = element(doc, "textarea", { id: createSettingsId(view, "instruction"), "aria-label": "默认优化指令" }, [settings.instruction]);
      instruction.addEventListener("input", () => { state.settings.instruction = instruction.value; });
      
      const resetInstruction = actionButton(doc, "恢复默认", "reset-instruction", { icon: "refresh" });
      resetInstruction.addEventListener("click", () => {
        state.settings.instruction = RENDERER_DEFAULTS.instruction;
        instruction.value = RENDERER_DEFAULTS.instruction;
        setInlineNotice("已恢复默认优化指令。");
      });

      const savePresetBtn = actionButton(doc, "保存预设与指令", "save-preset-instruction", { icon: "check", kind: "primary" });
      savePresetBtn.addEventListener("click", async () => {
        setViewBusy(view, true);
        try {
          const activePreset = presetsList.find((p) => p.id === (settings.activePresetId || "general"));
          if (activePreset) {
            activePreset.instruction = instruction.value;
            await callNode("save-preset", { preset: activePreset });
          }
          const response = await callNode("save-settings", { settings: { ...state.settings, instruction: instruction.value } });
          state.settings = { ...RENDERER_DEFAULTS, ...response.settings };
          setInlineNotice(`预设【${currentPreset.name}】与优化指令已保存。`, "success");
          view.render();
        } catch (error) {
          setInlineNotice(error.message, "error");
        } finally {
          setViewBusy(view, false);
        }
      });

      presetCard.append(field(doc, `当前预设指令（${currentPreset.name}）`, instruction, "只影响最终生成；多轮澄清始终使用固定 JSON 协议指令。"));
      const presetActions = element(doc, "div", { className: "ctpo-actions", style: "margin-top: 10px; justify-content: flex-end;" }, [resetInstruction, savePresetBtn]);
      presetCard.append(presetActions);

      // Card 5: 优化历史与收藏
      const historyCard = element(doc, "section", {
        className: "ctpo-card",
        "aria-labelledby": `${view.id}-history`,
        "data-ctpo-settings-section": "history",
      });
      historyCard.append(element(doc, "h2", { id: `${view.id}-history` }, ["优化历史与收藏"]));
      
      const historyLimit = element(doc, "select", { id: createSettingsId(view, "history-limit") });
      for (const value of HISTORY_OPTIONS) historyLimit.append(element(doc, "option", { value, textContent: value === 0 ? "0（不保留）" : String(value) }));
      historyLimit.value = String(settings.historyLimit);
      historyLimit.addEventListener("change", async () => {
        state.settings.historyLimit = Number(historyLimit.value);
        try {
          await callNode("save-settings", { settings: { ...state.settings, historyLimit: Number(historyLimit.value) } });
          setInlineNotice("历史保留数量已更新。", "success");
        } catch (e) {
          setInlineNotice(e.message, "error");
        }
      });
      historyCard.append(field(doc, "历史保留数量", historyLimit, "置顶收藏的历史不受数量限制。"));

      const historySearch = element(doc, "input", {
        type: "search",
        className: "ctpo-history-search",
        placeholder: "搜索历史提示词或优化结果...",
      });
      historySearch.value = view.historySearch;
      const historyList = element(doc, "ul", { className: "ctpo-history-list" });
      historySearch.addEventListener("input", () => {
        view.historySearch = historySearch.value;
        if (view.searchTimer) clearTimeout(view.searchTimer);
        view.searchTimer = setTimeout(() => {
          renderHistory(view, historyList, view.historySearch);
        }, 150);
      });
      historyCard.append(historySearch);
      renderHistory(view, historyList, view.historySearch);
      historyCard.append(historyList);

      const clearAllHistoryBtn = actionButton(doc, "清空所有历史", "clear-all-history", { icon: "trash", kind: "danger", title: "清空所有未置顶及已保存的历史记录" });
      clearAllHistoryBtn.addEventListener("click", () => {
        showModalDialog({
          doc,
          title: "清空优化历史",
          message: "确认清空所有提示词优化历史记录吗？",
          confirmText: "确认清空",
          isDanger: true,
          onConfirm: async () => {
            try {
              await callNode("clear-history");
              state.history = [];
              renderHistory(view, historyList, view.historySearch);
              setInlineNotice("历史记录已清空。", "success");
            } catch (e) {
              setInlineNotice(e.message, "error");
            }
          },
        });
      });
      const historyBottomActions = element(doc, "div", { className: "ctpo-actions", style: "margin-top: 10px;" }, [clearAllHistoryBtn]);
      historyCard.append(historyBottomActions);

      // Card 6: 临时定位诊断
      const debugCard = element(doc, "section", {
        className: "ctpo-card",
        "aria-labelledby": `${view.id}-debug-geometry`,
        "data-ctpo-settings-section": "debug-geometry",
      });
      debugCard.append(
        element(doc, "h2", { id: `${view.id}-debug-geometry` }, ["临时定位诊断"]),
        element(doc, "p", { className: "ctpo-hint" }, ["仅在开发或排查按钮定位异常时使用；默认关闭且不记录任何输入内容或 API Key。"]),
      );

      const debugDetails = element(doc, "details", { className: "ctpo-debug-details" });
      const debugSummary = element(doc, "summary", { className: "ctpo-debug-summary" }, [
        element(doc, "span", {}, ["🛠️ 展开 / 折叠定位诊断测试工具"]),
        element(doc, "span", { className: "ctpo-badge", style: "font-size: 11px; opacity: 0.8;" }, [state.debugGeometry ? "诊断已开启" : "默认隐藏"]),
      ]);

      const debugContent = element(doc, "div", { className: "ctpo-debug-content" });

      const debugGuide = element(doc, "div", { className: "ctpo-debug-guide" }, [
        element(doc, "strong", {}, ["📖 定位诊断测试操作步骤："]),
        element(doc, "ol", {}, [
          element(doc, "li", {}, ["开启下方的「启用临时定位诊断」开关；"]),
          element(doc, "li", {}, ["返回主界面，在 Composer 输入框中粘贴或输入任意一段提示词；"]),
          element(doc, "li", {}, ["观察 Composer 附近是否正常出现「✦ 优化 ⌵」按钮；"]),
          element(doc, "li", {}, ["回到此设置卡片，点击「选择诊断文本（Ctrl+C 复制）」导出诊断 JSON 并反馈给开发者；"]),
          element(doc, "li", {}, ["测试完成后，可随时关闭开关或点击「清空诊断」释放临时会话数据。"]),
        ]),
      ]);

      const debugSwitchLabel = element(doc, "label", { className: "ctpo-switch-row" });
      const debugSwitchCopy = element(doc, "span", {}, [
        element(doc, "span", { className: "ctpo-label" }, ["启用临时定位诊断"]),
        element(doc, "span", { className: "ctpo-hint" }, ["打开后请在输入框键入一次，再复制下方诊断 JSON。关闭或停用后记录不写入磁盘。"]),
      ]);
      const debugSwitch = element(doc, "input", {
        type: "checkbox",
        className: "ctpo-switch",
        role: "switch",
        "aria-label": "启用临时定位诊断",
        checked: state.debugGeometry,
      });
      debugSwitch.addEventListener("change", () => {
        setDebugGeometry(debugSwitch.checked);
        view.render();
      });
      debugSwitchLabel.append(debugSwitchCopy, debugSwitch);

      const debugOutput = element(doc, "textarea", {
        className: "ctpo-debug-output",
        "aria-label": "定位诊断输出",
        readOnly: true,
        spellcheck: "false",
        wrap: "off",
      });
      debugOutput.value = JSON.stringify(state.debugGeometryReports, null, 2);
      view.debugOutput = debugOutput;

      const debugActions = element(doc, "div", { className: "ctpo-actions" });
      const selectDebug = actionButton(doc, "选择诊断文本（Ctrl+C 复制）", "select-debug-geometry", { icon: "copy", title: "选择不含输入内容的几何诊断 JSON" });
      selectDebug.addEventListener("click", () => {
        debugOutput.focus?.();
        debugOutput.select?.();
        setInlineNotice("诊断 JSON 已选中，请按 Ctrl+C 复制；内容不含输入文本。", "success");
      });
      const clearDebug = actionButton(doc, "清空诊断", "clear-debug-geometry", { icon: "trash", kind: "danger", title: "清空本次会话的定位诊断记录" });
      clearDebug.addEventListener("click", () => {
        state.debugGeometryReports.length = 0;
        refreshDebugOutputViews();
        setInlineNotice("定位诊断记录已清空。", "success");
      });
      debugActions.append(selectDebug, clearDebug);

      debugContent.append(debugGuide, debugSwitchLabel, debugActions, debugOutput);
      debugDetails.append(debugSummary, debugContent);
      debugCard.append(debugDetails);

      // Card 7: 卸载前清理数据
      const cleanupCard = element(doc, "section", { className: "ctpo-card", "aria-labelledby": `${view.id}-cleanup`, style: "margin-top: 16px;" });
      cleanupCard.append(
        element(doc, "h2", { id: `${view.id}-cleanup` }, ["卸载前清理数据"]),
        element(doc, "p", { className: "ctpo-hint" }, ["清除 API Key、历史记录和已保存 Provider 配置；包停用不会自动执行此操作。"]),
      );
      const cleanupButton = actionButton(doc, "清理包数据", "clear-history", { icon: "trash", kind: "danger" });
      cleanupButton.addEventListener("click", () => {
        showModalDialog({
          doc,
          title: "清理所有包数据",
          message: "清除 API Key、历史记录和已保存 Provider 配置？建议在卸载前执行。",
          confirmText: "确认清理",
          isDanger: true,
          onConfirm: async () => {
            setViewBusy(view, true);
            try {
              await callNode("clear-api-key");
              await callNode("clear-history");
              const response = await callNode("save-settings", {
                settings: {
                  ...RENDERER_DEFAULTS,
                  apiKey: "",
                  clearApiKey: true,
                },
              });
              state.settings = { ...RENDERER_DEFAULTS, ...(response.settings ?? {}), apiKey: "" };
              state.history = [];
              state.latestSnapshot = null;
              state.latestRestoreEntry?.restoreButton?.remove();
              state.latestRestoreEntry = null;
              setNotice("包数据已清理，可以继续卸载功能包。", "success");
              view.render();
              scheduleScan();
            } catch (error) {
              setNotice(`包数据清理未完成：${error.message}`, "error");
            } finally {
              setViewBusy(view, false);
            }
          },
        });
      });
      cleanupCard.append(element(doc, "div", { className: "ctpo-actions" }, [cleanupButton]));

      wrapper.append(generalCard, profileCard, providerCard, presetCard, historyCard, debugCard, cleanupCard);

      const status = element(doc, "div", { className: "ctpo-status", role: "status", "aria-live": "polite" }, [state.notice.text]);
      status.dataset.kind = state.notice.kind;
      view.status = status;
      wrapper.append(status);
      container.append(wrapper);
      setViewBusy(view, view.busy);
    };

    state.settingsViews.add(view);
    view.render();
    return () => {
      state.settingsViews.delete(view);
      container.removeAttribute(ROOT_ATTRIBUTE);
    };
  };

  const closeSettingsDialog = ({ restoreFocus = true } = {}) => {
    if (!state.settingsDialog) return;
    const { backdrop, cleanup, returnFocus } = state.settingsDialog;
    state.settingsDialog = null;
    cleanup?.();
    backdrop.remove();
    if (restoreFocus && returnFocus?.focus) returnFocus.focus();
  };

  const openSettingsDialog = ({ focusHistory = false } = {}) => {
    if (state.settingsDialog) closeSettingsDialog({ restoreFocus: false });
    const returnFocus = doc.activeElement;
    const backdrop = element(doc, "div", {
      className: "ctpo-settings-dialog-backdrop",
      role: "presentation",
    });
    backdrop.style.inset = "0";
    backdrop.style.position = "fixed";
    backdrop.style.zIndex = "2147483002";
    backdrop.style.display = "flex";
    backdrop.style.alignItems = "center";
    backdrop.style.justifyContent = "center";
    backdrop.style.background = "rgba(0, 0, 0, 0.4)";

    const dialog = element(doc, "div", {
      className: "ctpo-settings-dialog",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "ctpo-settings-dialog-title",
    });
    const header = element(doc, "header", { className: "ctpo-settings-dialog-header" }, [
      element(doc, "h2", { id: "ctpo-settings-dialog-title" }, ["提示词优化设置"]),
    ]);
    const close = element(doc, "button", {
      type: "button",
      className: "ctpo-panel-close",
      "aria-label": "关闭提示词优化设置",
      "data-ctpo-tooltip": "关闭",
    }, [svgIcon(doc, "close")]);
    close.addEventListener("click", () => closeSettingsDialog({ restoreFocus: true }));
    header.append(close);
    const content = element(doc, "div", { className: "ctpo-settings-dialog-content" });
    dialog.append(header, content);
    backdrop.append(dialog);
    uiRoot.append(backdrop);

    const cleanup = buildSettingsView(content, { embedded: true });
    state.settingsDialog = { backdrop, cleanup, returnFocus };
    backdrop.addEventListener("pointerdown", (event) => {
      if (event.target === backdrop) closeSettingsDialog({ restoreFocus: true });
    });

    const history = focusHistory ? content.querySelector?.('[data-ctpo-settings-section="history"]') : null;
    if (history) history.scrollIntoView?.({ block: "start" });
    else close.focus?.();
  };

  const openSettings = ({ focusHistory = false } = {}) => {
    if (typeof settingsRegistration?.open === "function") {
      settingsRegistration.open();
      if (focusHistory) {
        setTimeout(() => {
          const history = doc.querySelector?.('[data-ctpo-settings-section="history"]');
          history?.scrollIntoView?.({ block: "start" });
        }, 30);
      }
      return;
    }
    openSettingsDialog({ focusHistory });
  };

  const onDocumentPointerDown = (event) => {
    if (state.composerMenu && !state.composerMenu.element.contains(event.target) && !state.composerMenu.entry?.menuButton?.contains(event.target)) {
      closeComposerMenu();
    }
  };
  doc.addEventListener("pointerdown", onDocumentPointerDown, true);

  const reflowPanel = () => {
    if (!state.panel || state.disposed) return;
    const panel = panelHost.querySelector?.(".ctpo-panel");
    if (!panel) return;
    applyPanelGeometry(panel, state.panel, { preservePosition: state.panel.layout?.manual === true });
  };

  doc.addEventListener("scroll", reflowPanel, true);
  doc.addEventListener("scroll", reflowComposerButtons, true);
  doc.defaultView?.addEventListener("resize", reflowPanel);
  doc.defaultView?.addEventListener("resize", reflowComposerButtons);

  // MutationObserver with requestAnimationFrame throttling
  let observerRaf = null;
  const observer = new MutationObserver((records) => {
    if (state.disposed) return;
    if (records.some(({ target }) => !uiRoot.contains(target))) {
      if (observerRaf) cancelAnimationFrame(observerRaf);
      observerRaf = requestAnimationFrame(() => {
        observerRaf = null;
        scheduleScan();
      });
    }
  });

  observer.observe(doc.body || doc.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "aria-expanded",
      "aria-hidden",
      "class",
      "data-open",
      "data-state",
      "hidden",
      "style",
    ],
  });

  // 33ms SSE Stream Batch Scheduler (30 FPS Energy-Saving Mode)
  const streamBatchScheduler = new StreamBatchScheduler((accumulated, isDone) => {
    if (state.panel && state.panel.kind === "preview") {
      state.panel.result = accumulated;
      if (isDone) {
        state.panel.isStreaming = false;
      }
      const resultTextarea = panelHost.querySelector("#ctpo-preview-result");
      if (resultTextarea && resultTextarea.value !== accumulated) {
        resultTextarea.value = accumulated;
      } else {
        renderPanel();
      }
    }
  });

  // Streaming chunk listener from Node RPC
  let chunkUnsubscribe = null;
  if (typeof node?.on === "function") {
    chunkUnsubscribe = node.on("optimizer-chunk", ({ operationId, delta, accumulated, isDone }) => {
      if (state.panel && state.panel.kind === "preview") {
        streamBatchScheduler.push(accumulated, Boolean(isDone));
      }
    });
  }

  // Load initial settings and history
  (async () => {
    try {
      const s = await callNode("load-settings");
      state.settings = { ...RENDERER_DEFAULTS, ...(s.settings ?? {}) };
      const h = await callNode("list-history");
      state.history = Array.isArray(h.entries) ? h.entries : [];
      refreshSettingsViews();
      scheduleScan();
    } catch {
      scheduleScan();
    }
  })();

  const settingsRegistration = ui?.registerSettingsPane?.({
    title: "提示词优化",
    render: (container) => buildSettingsView(container, { embedded: false }),
  });

  const dispose = () => {
    state.disposed = true;
    if (state.scanTimer) clearTimeout(state.scanTimer);
    if (state.scanRaf) cancelAnimationFrame(state.scanRaf);
    if (observerRaf) cancelAnimationFrame(observerRaf);
    if (tooltipTimer) clearTimeout(tooltipTimer);
    if (toastTimer) clearTimeout(toastTimer);
    observer.disconnect();
    doc.removeEventListener("pointerover", onGlobalPointerOver, true);
    doc.removeEventListener("pointerout", onGlobalPointerOut, true);
    doc.removeEventListener("pointerdown", onGlobalPointerDown, true);
    doc.removeEventListener("pointerdown", onDocumentPointerDown, true);
    doc.removeEventListener("scroll", reflowPanel, true);
    doc.removeEventListener("scroll", reflowComposerButtons, true);
    doc.defaultView?.removeEventListener("resize", reflowPanel);
    doc.defaultView?.removeEventListener("resize", reflowComposerButtons);
    if (typeof chunkUnsubscribe === "function") chunkUnsubscribe();
    if (typeof settingsRegistration?.unregister === "function") settingsRegistration.unregister();
    else if (typeof settingsRegistration?.dispose === "function") settingsRegistration.dispose();
    closePanel();
    closeComposerMenu();
    closeSettingsDialog({ restoreFocus: false });
    for (const entry of [...state.attached.values()]) detachComposer(entry);
    uiRoot.remove();
  };

  if (typeof onCleanup === "function") onCleanup(dispose);

  return { dispose, scheduleScan };
}
