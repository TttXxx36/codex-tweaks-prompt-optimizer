export const ROOT_ATTRIBUTE = "data-codex-tweaks-ct-prompt-optimizer";
export const BUTTON_CLASS = "ct-prompt-optimizer-button";
export const RESTORE_BUTTON_CLASS = "ct-prompt-optimizer-restore";

const EXCLUDED_SELECTOR = [
  "dialog",
  "[role=dialog]",
  "[aria-modal=true]",
  "[role=menu]",
  "[role=listbox]",
  "[role=menuitem]",
  "[data-settings]",
  "[data-history-editor]",
  "[data-message-id] [contenteditable=true]",
  "[data-history] [contenteditable=true]",
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
  const isContentEditable = element.isContentEditable === true || element.contentEditable === "true";
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
  const candidates = [...queryRoot.querySelectorAll("textarea, [contenteditable=true], [role=textbox]")]
    .filter(isComposerCandidate);
  return candidates.sort((left, right) => composerScore(right) - composerScore(left));
}

function composerScore(element) {
  let score = 0;
  const ancestor = element.closest?.("[data-composer], [data-testid*=composer], form");
  if (ancestor) score += 4;
  const placeholder = `${element.getAttribute?.("placeholder") ?? ""} ${element.getAttribute?.("aria-label") ?? ""}`.toLowerCase();
  if (/message|prompt|输入|消息|composer/.test(placeholder)) score += 3;
  if (element.tagName?.toLowerCase() === "textarea") score += 1;
  return score;
}

export function findBestComposer(scope) {
  return findComposerCandidates(scope)[0] ?? null;
}

export function isModelPickerControl(element) {
  if (!element || isExcludedFromComposer(element)) return false;
  const role = element.getAttribute?.("role")?.toLowerCase();
  const tagName = element.tagName?.toLowerCase();
  if (role === "combobox" || tagName === "select") return true;
  const label = [
    element.getAttribute?.("aria-label"),
    element.getAttribute?.("title"),
    element.textContent,
    element.getAttribute?.("data-testid"),
  ].filter(Boolean).join(" ").toLowerCase();
  return /model|模型|gpt|claude/.test(label) && (tagName === "button" || role === "button" || role === "combobox");
}

export function findModelPicker(composer) {
  let current = composer;
  for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
    const controls = [...(current.querySelectorAll?.("button, [role=button], [role=combobox], select") ?? [])];
    const match = controls.find(isModelPickerControl);
    if (match) return match;
  }
  return null;
}
