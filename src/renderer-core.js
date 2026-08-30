export const ROOT_ATTRIBUTE = "data-codex-tweaks-ct-prompt-optimizer";
export const BUTTON_CLASS = "ct-prompt-optimizer-button";
export const RESTORE_BUTTON_CLASS = "ct-prompt-optimizer-restore";

export function modelOptionValues(models) {
  if (!Array.isArray(models)) return [];
  return [...new Set(models
    .filter((model) => typeof model === "string")
    .map((model) => model.trim())
    .filter(Boolean))];
}

const EXCLUDED_SELECTOR = [
  "dialog",
  "[role=dialog]",
  "[aria-modal=true]",
  "[role=menu]",
  "[role=listbox]",
  "[role=menuitem]",
  "[data-settings]",
  "[data-history-editor]",
  "[data-message-id] [contenteditable]",
  "[data-history] [contenteditable]",
].join(",");

function hasAttributeValue(element, name, value) {
  return element?.getAttribute?.(name)?.toLowerCase() === value;
}

export function isElementVisible(element) {
  if (!element || element.hidden || hasAttributeValue(element, "aria-hidden", "true")) return false;
  const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
  if (style && (style.display === "none" || style.visibility === "hidden")) return false;
  if (typeof element.getClientRects === "function" && element.getClientRects().length === 0) {
    // Test doubles often do not implement layout. A real element with no rect is hidden.
    if (element.ownerDocument?.defaultView) return false;
  }
  return true;
}

export function isExcludedFromComposer(element) {
  if (!element) return true;
  if (element.matches?.(EXCLUDED_SELECTOR)) return true;
  const ancestor = element.closest?.(EXCLUDED_SELECTOR);
  if (ancestor) return true;
  const role = element.getAttribute?.("role")?.toLowerCase();
  if (["menu", "listbox", "dialog"].includes(role)) return true;
  return false;
}

export function isComposerCandidate(element) {
  if (!element || !isElementVisible(element) || isExcludedFromComposer(element)) return false;
  const tagName = element.tagName?.toLowerCase();
  const isTextArea = tagName === "textarea";
  const contentEditableAttribute = element.getAttribute?.("contenteditable");
  const contentEditableValue = String(element.contentEditable ?? "").toLowerCase();
  const isContentEditable = element.isContentEditable === true
    || ["true", "plaintext-only"].includes(contentEditableValue)
    || (typeof contentEditableAttribute === "string" && contentEditableAttribute.toLowerCase() !== "false");
  const isRoleTextbox = element.getAttribute?.("role")?.toLowerCase() === "textbox";
  if (!isTextArea && !isContentEditable && !isRoleTextbox) return false;
  if (element.disabled || element.readOnly || element.getAttribute?.("aria-disabled") === "true") return false;
  if (tagName === "input") return false;
  const type = element.getAttribute?.("type")?.toLowerCase();
  if (type && type !== "text") return false;
  return true;
}

export function readInputText(element) {
  if (!element) return "";
  if (element.tagName?.toLowerCase() === "textarea" || "value" in element) return String(element.value ?? "");
  return String(element.innerText ?? element.textContent ?? "");
}

export function dispatchInput(element) {
  const EventCtor = element?.ownerDocument?.defaultView?.Event ?? globalThis.Event;
  if (typeof EventCtor !== "function") return;
  element.dispatchEvent?.(new EventCtor("input", { bubbles: true, inputType: "insertText" }));
}

export function replaceInputText(element, value) {
  const text = String(value ?? "");
  if (!element) return false;
  if (element.tagName?.toLowerCase() === "textarea") {
    const prototype = element.ownerDocument?.defaultView?.HTMLTextAreaElement?.prototype;
    const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor?.set) descriptor.set.call(element, text);
    else element.value = text;
    dispatchInput(element);
    return true;
  }
  if (element.isContentEditable === true || element.contentEditable === "true" || element.getAttribute?.("role") === "textbox") {
    element.textContent = text;
    dispatchInput(element);
    return true;
  }
  return false;
}

export function composerConversationId(element) {
  const direct = element?.getAttribute?.("data-conversation-id")
    || element?.getAttribute?.("data-thread-id")
    || element?.getAttribute?.("aria-controls");
  if (direct) return direct;
  const owner = element?.closest?.("[data-conversation-id], [data-thread-id], [data-above-composer-conversation-id]");
  return owner?.getAttribute?.("data-conversation-id")
    || owner?.getAttribute?.("data-thread-id")
    || owner?.getAttribute?.("data-above-composer-conversation-id")
    || "location-only";
}

export function currentLocationHref(element) {
  return element?.ownerDocument?.defaultView?.location?.href ?? "";
}

export function captureComposerContext(element, href = currentLocationHref(element)) {
  const original = readInputText(element);
  const conversationId = composerConversationId(element);
  return {
    element,
    href,
    conversationId,
    original,
    key: `${conversationId}|${href}`,
  };
}

export function isSameComposerContext(context, element, href, expectedText) {
  if (!context || !element) return false;
  if (context.element !== element) return false;
  if (element.isConnected === false) return false;
  if (context.href !== href) return false;
  if (context.conversationId !== composerConversationId(element)) return false;
  if (expectedText !== undefined && readInputText(element) !== expectedText) return false;
  return true;
}

export function findComposerCandidates(scope) {
  const queryRoot = scope?.querySelectorAll ? scope : scope?.ownerDocument;
  if (!queryRoot?.querySelectorAll) return [];
  const candidates = [...queryRoot.querySelectorAll("textarea, [contenteditable], [role=textbox]")]
    .filter(isComposerCandidate);
  return candidates.sort((left, right) => composerScore(right) - composerScore(left));
}

function composerScore(element) {
  let score = 0;
  const ancestor = element.closest?.("[data-composer], [data-composer-placement], [data-testid*=composer], form");
  if (ancestor) score += 4;
  const placeholder = `${element.getAttribute?.("placeholder") ?? ""} ${element.getAttribute?.("aria-label") ?? ""}`.toLowerCase();
  if (/message|prompt|输入|消息|composer/.test(placeholder)) score += 3;
  if (element.tagName?.toLowerCase() === "textarea") score += 1;
  return score;
}

export function findBestComposer(scope) {
  return findComposerCandidates(scope)[0] ?? null;
}

function modelPickerScore(element) {
  if (!element || isExcludedFromComposer(element)) return -1;
  const role = element.getAttribute?.("role")?.toLowerCase();
  const tagName = element.tagName?.toLowerCase();
  const ariaHasPopup = element.getAttribute?.("aria-haspopup")?.toLowerCase();
  const testId = element.getAttribute?.("data-testid")?.toLowerCase() ?? "";
  const label = [
    element.getAttribute?.("aria-label"),
    element.getAttribute?.("title"),
    element.textContent,
    testId,
  ].filter(Boolean).join(" ").toLowerCase();
  if (/project|项目|workspace|工作区|repository|repo|仓库/.test(label)) return -1;
  const hasModelLabel = /model|模型|gpt|claude|codex|agent|代理/.test(label);
  const hasModelVersion = /\b\d+(?:\.\d+){1,2}\b/.test(label);
  const hasCompactModelValue = /^(auto|automatic|自动)$/.test(label.trim());
  const hasExplicitModelTestId = /model|模型/.test(testId);
  const hasModelIdentity = tagName === "select"
    || hasModelLabel
    || hasModelVersion
    || hasCompactModelValue
    || hasExplicitModelTestId;
  if (!hasModelIdentity) return -1;
  if (tagName !== "select" && role !== "button" && role !== "combobox" && !["listbox", "menu"].includes(ariaHasPopup)) return -1;
  let score = tagName === "select" ? 4 : 1;
  if (role === "combobox") score += 2;
  if (["listbox", "menu"].includes(ariaHasPopup)) score += 2;
  if (hasExplicitModelTestId) score += 8;
  if (hasModelLabel) score += 8;
  if (hasModelVersion) score += 7;
  if (hasCompactModelValue) score += 6;
  return score;
}

export function isModelPickerControl(element) {
  return modelPickerScore(element) > 0;
}

function isComposerRegion(element) {
  if (!element) return false;
  const tagName = element.tagName?.toLowerCase();
  const testId = element.getAttribute?.("data-testid")?.toLowerCase() ?? "";
  return tagName === "form"
    || element.getAttribute?.("data-composer") != null
    || element.getAttribute?.("data-composer-placement") != null
    || /composer/.test(testId);
}

export function findComposerRegion(composer) {
  const body = composer?.ownerDocument?.body;
  for (let current = composer; current && current !== body; current = current.parentElement) {
    if (isComposerRegion(current)) return current;
  }
  return composer?.parentElement ?? null;
}

function findComposerControl(composer, selector, matches) {
  const region = findComposerRegion(composer);
  const controls = [...(region?.querySelectorAll?.(selector) ?? [])];
  return controls.find(matches) ?? null;
}

export function findModelPicker(composer) {
  const region = findComposerRegion(composer);
  const controls = [...(region?.querySelectorAll?.(
    "button, [role=button], [role=combobox], [aria-haspopup], [data-testid*=model], select",
  ) ?? [])];
  return controls
    .map((control) => ({ control, score: modelPickerScore(control) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)[0]?.control ?? null;
}

function contextWindowScore(element) {
  if (!element || isExcludedFromComposer(element) || !isElementVisible(element)) return -1;
  const ariaExpanded = element.getAttribute?.("aria-expanded")?.toLowerCase();
  const dataOpen = element.getAttribute?.("data-open")?.toLowerCase();
  const dataState = element.getAttribute?.("data-state")?.toLowerCase();
  if (ariaExpanded === "false" || dataOpen === "false" || ["closed", "collapsed", "hidden"].includes(dataState)) return -1;
  const role = element.getAttribute?.("role")?.toLowerCase();
  const tagName = element.tagName?.toLowerCase();
  const testId = element.getAttribute?.("data-testid")?.toLowerCase() ?? "";
  const label = [
    element.getAttribute?.("aria-label"),
    element.getAttribute?.("title"),
    testId,
    element.textContent,
  ].filter(Boolean).join(" ").toLowerCase();
  const identity = `${label} ${String(element.className ?? "").toLowerCase()}`;
  if (!/(?:context(?:[\s_-]+(?:window|usage|limit))?|上下文(?:窗口)?|背景信息|background[\s_-]+(?:info|information|window))/.test(identity)) return -1;
  let score = 1;
  if (/context[\s_-]*(?:window|usage|limit)|上下文窗口|背景信息|background[\s_-]+(?:info|information|window)/.test(identity)) score += 6;
  if (/context|上下文|背景信息/.test(testId)) score += 8;
  if (tagName === "button" || ["button", "combobox"].includes(role)) score += 3;
  return score;
}

function findComposerContextWindow(composer) {
  const region = findComposerRegion(composer);
  const controls = [...(region?.querySelectorAll?.(
    "button, [role=button], [role=combobox], [aria-haspopup], [aria-label], [title], [data-testid], [data-context-window], [data-context], [data-background-info], [class*=context-window], [class*=context_window], [class*=contextWindow], [class*=background-info], [class*=background_info], select",
  ) ?? [])];
  return controls
    .map((control) => ({ control, score: contextWindowScore(control) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)[0]?.control ?? null;
}

function isComposerSubmitControl(element) {
  if (!element || isExcludedFromComposer(element)) return false;
  const tagName = element.tagName?.toLowerCase();
  const role = element.getAttribute?.("role")?.toLowerCase();
  if (tagName !== "button" && role !== "button") return false;
  if (element.disabled || element.getAttribute?.("aria-disabled") === "true") return false;
  if (element.getAttribute?.("type")?.toLowerCase() === "submit") return true;
  const label = [
    element.getAttribute?.("aria-label"),
    element.getAttribute?.("title"),
    element.getAttribute?.("data-testid"),
    element.textContent,
  ].filter(Boolean).join(" ").toLowerCase();
  return /\b(send|submit|run|start|execute)\b|发送|提交|运行|开始|执行/.test(label);
}

export function findComposerActionAnchor(composer) {
  const contextWindow = findComposerContextWindow(composer);
  if (contextWindow?.parentElement) return contextWindow;
  const modelPicker = findModelPicker(composer);
  if (modelPicker?.parentElement) return modelPicker;
  const submitControl = findComposerControl(composer, "button, [role=button]", isComposerSubmitControl);
  return submitControl?.parentElement ? submitControl : null;
}

export function getComposerButtonPosition(anchorRect, buttonRect = {}, viewport = {}, gap = 24) {
  const leftValue = Number(anchorRect?.left);
  const topValue = Number(anchorRect?.top);
  const left = Number.isFinite(leftValue) ? leftValue : Number(anchorRect?.x);
  const top = Number.isFinite(topValue) ? topValue : Number(anchorRect?.y);
  const anchorHeight = Number.isFinite(Number(anchorRect?.height))
    ? Number(anchorRect.height)
    : Number(anchorRect?.bottom) - top;
  const buttonWidth = Math.max(0, Number(buttonRect?.width) || 0);
  const buttonHeight = Math.max(0, Number(buttonRect?.height) || 0);
  const viewportWidth = Number(viewport?.width);
  const viewportHeight = Number(viewport?.height);
  if (![left, top, anchorHeight].every(Number.isFinite)) return null;
  const requestedLeft = left - buttonWidth - Number(gap || 0);
  const maxLeft = Number.isFinite(viewportWidth) ? Math.max(4, viewportWidth - buttonWidth - 4) : requestedLeft;
  const requestedTop = top + (anchorHeight - buttonHeight) / 2;
  const maxTop = Number.isFinite(viewportHeight) ? Math.max(4, viewportHeight - buttonHeight - 4) : requestedTop;
  return {
    left: Math.round(Math.min(Math.max(4, requestedLeft), maxLeft)),
    top: Math.round(Math.min(Math.max(4, requestedTop), maxTop)),
  };
}
