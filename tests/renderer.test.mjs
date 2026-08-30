import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  captureComposerContext,
  findComposerActionAnchor,
  findComposerCandidates,
  findModelPicker,
  isComposerCandidate,
  isSameComposerContext,
  readInputText,
  replaceInputText,
} from "../src/renderer-core.js";
import {
  findPanelPosition,
  normalizePanelSize,
  panelRectsOverlap,
} from "../src/panel-geometry.js";

class FakeElement {
  constructor(tagName, attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
    this.children = [];
    this.parentElement = null;
    this.value = attributes.value ?? "";
    this.textContent = attributes.textContent ?? "";
    this.innerText = this.textContent;
    this.isContentEditable = attributes.contenteditable === "true" || attributes.contenteditable === "plaintext-only";
    this.contentEditable = attributes.contenteditable ?? "inherit";
    this.isConnected = true;
    this.ownerDocument = {
      defaultView: {
        location: { href: "https://codex.test/conversation/1" },
        getComputedStyle: () => ({ display: "block", visibility: "visible" }),
        Event: class Event {
          constructor(type) { this.type = type; }
        },
      },
    };
    this.events = [];
  }

  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  matches(selector) {
    if (selector.includes("dialog") && this.tagName === "DIALOG") return true;
    if (selector.includes("[data-settings]") && this.attributes["data-settings"] !== undefined) return true;
    if (selector.includes("[data-message-id]") && this.attributes["data-message-id"] !== undefined) return true;
    if (selector.includes("[role=menu]") && this.getAttribute("role") === "menu") return true;
    if (selector.includes("[role=listbox]") && this.getAttribute("role") === "listbox") return true;
    if (selector.includes("[role=dialog]") && this.getAttribute("role") === "dialog") return true;
    return false;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  getClientRects() {
    return [{ width: 100, height: 20 }];
  }

  dispatchEvent(event) {
    this.events.push(event.type);
  }
}

test("recognizes textarea and contenteditable composers while excluding UI editors", () => {
  const textarea = new FakeElement("textarea", { placeholder: "Message" });
  const editable = new FakeElement("div", { contenteditable: "true", role: "textbox" });
  const plaintextEditable = new FakeElement("div", { contenteditable: "plaintext-only", role: "textbox" });
  const settings = new FakeElement("section", { "data-settings": "true" });
  const settingsInput = new FakeElement("textarea");
  settings.append(settingsInput);
  const history = new FakeElement("article", { "data-message-id": "message-1" });
  const historyEditor = new FakeElement("div", { contenteditable: "true" });
  history.append(historyEditor);
  assert.equal(isComposerCandidate(textarea), true);
  assert.equal(isComposerCandidate(editable), true);
  assert.equal(isComposerCandidate(plaintextEditable), true);
  assert.equal(isComposerCandidate(settingsInput), false);
  assert.equal(isComposerCandidate(historyEditor), false);
  const scope = { querySelectorAll: () => [settingsInput, historyEditor, editable, textarea] };
  assert.deepEqual(findComposerCandidates(scope), [textarea, editable]);
});

test("places model control lookup within composer ancestors and preserves context identity", () => {
  const toolbar = new FakeElement("div", { "data-composer": "true" });
  const picker = new FakeElement("button", { role: "button", "aria-label": "模型" });
  const composer = new FakeElement("textarea", { placeholder: "Message", value: "原文" });
  toolbar.append(picker, composer);
  toolbar.querySelectorAll = (selector) => selector.includes("button") ? [picker] : [];
  assert.equal(findModelPicker(composer), picker);
  const context = captureComposerContext(composer);
  assert.equal(isSameComposerContext(context, composer, context.href, "原文"), true);
  composer.value = "用户已编辑";
  assert.equal(isSameComposerContext(context, composer, context.href, "原文"), false);
  composer.value = "原文";
  composer.isConnected = false;
  assert.equal(isSameComposerContext(context, composer, context.href, "原文"), false);
});

test("recognizes the Auto listbox model selector used by Codex and Work composers", () => {
  const toolbar = new FakeElement("div", { "data-composer": "true" });
  const picker = new FakeElement("button", { role: "button", "aria-haspopup": "listbox", "aria-label": "Auto" });
  const composer = new FakeElement("textarea", { placeholder: "Message", value: "原文" });
  toolbar.append(picker, composer);
  toolbar.querySelectorAll = (selector) => selector.includes("button") ? [picker] : [];

  assert.equal(findModelPicker(composer), picker);
  assert.equal(findComposerActionAnchor(composer), picker);
});

test("recognizes a generic listbox trigger before the send action", () => {
  const toolbar = new FakeElement("div", { "data-composer": "true" });
  const picker = new FakeElement("div", { "aria-haspopup": "listbox", "aria-label": "模型选择" });
  const submit = new FakeElement("button", { type: "submit", "aria-label": "发送" });
  const composer = new FakeElement("textarea", { placeholder: "Message", value: "原文" });
  toolbar.append(picker, submit, composer);
  toolbar.querySelectorAll = (selector) => {
    if (selector.includes("[aria-haspopup]")) return [picker, submit];
    if (selector.includes("button")) return [submit];
    return [];
  };

  assert.equal(findModelPicker(composer), picker);
  assert.equal(findComposerActionAnchor(composer), picker);
});

test("finds a model picker in an outer Composer region before falling back to send", () => {
  const composerRegion = new FakeElement("section", { "data-composer": "true" });
  const picker = new FakeElement("button", { role: "button", "aria-haspopup": "listbox", "aria-label": "Auto" });
  const submit = new FakeElement("button", { type: "submit", "aria-label": "发送" });
  const composer = new FakeElement("textarea", { placeholder: "Message", value: "原文" });
  let inputBranch = composerRegion;
  for (let depth = 0; depth < 7; depth += 1) {
    const wrapper = new FakeElement("div");
    inputBranch.append(wrapper);
    inputBranch = wrapper;
  }
  composerRegion.append(picker);
  inputBranch.append(composer, submit);
  composerRegion.querySelectorAll = (selector) => {
    if (selector.includes("[aria-haspopup]")) return [picker, submit];
    if (selector.includes("button")) return [picker, submit];
    return [];
  };
  inputBranch.querySelectorAll = (selector) => selector.includes("button") ? [submit] : [];

  assert.equal(findModelPicker(composer), picker);
  assert.equal(findComposerActionAnchor(composer), picker);
});

test("uses the submit action when a Codex or Work composer has no model picker", () => {
  const composerShell = new FakeElement("form", { "data-composer": "true" });
  const composer = new FakeElement("div", {
    contenteditable: "plaintext-only",
    role: "textbox",
    "aria-label": "Task prompt",
  });
  const startTask = new FakeElement("button", { type: "submit", "aria-label": "Start task" });
  composerShell.append(composer, startTask);
  composerShell.querySelectorAll = (selector) => selector.includes("button") ? [startTask] : [];

  assert.equal(isComposerCandidate(composer), true);
  assert.equal(findModelPicker(composer), null);
  assert.equal(findComposerActionAnchor(composer), startTask);
});

test("uses native-like replacement and input events for textarea/contenteditable", () => {
  const textarea = new FakeElement("textarea", { value: "old" });
  assert.equal(readInputText(textarea), "old");
  assert.equal(replaceInputText(textarea, "new"), true);
  assert.equal(textarea.value, "new");
  assert.deepEqual(textarea.events, ["input"]);

  const editable = new FakeElement("div", { contenteditable: "true", textContent: "old" });
  assert.equal(replaceInputText(editable, "new editable"), true);
  assert.equal(editable.textContent, "new editable");
  assert.deepEqual(editable.events, ["input"]);
});

test("renderer source declares lifecycle, semantic observation, fixed RPC names and stale-result guards", async () => {
  const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(source, /activate\(\{ root, onCleanup, api: _api, ui, node \}/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /attributeFilter:\s*\["aria-label", "aria-haspopup", "data-testid", "role", "title"\]/);
  assert.match(source, /data-codex-tweaks-prompt-optimizer/);
  assert.match(source, /findComposerActionAnchor/);
  assert.match(source, /placeComposerButton/);
  assert.match(source, /nextAnchor && nextAnchor !== entry\.anchor/);
  assert.match(source, /data-ctpo-drag-handle/);
  assert.match(source, /ResizeObserver/);
  assert.match(source, /doc\.addEventListener\("scroll", reflowPanel, true\)/);
  assert.match(source, /isSameComposerContext\(context/);
  for (const method of ["load-settings", "save-settings", "clear-api-key", "test-connection", "list-models", "optimize", "clarify-round", "list-history", "delete-history", "clear-history"]) {
    assert.match(source, new RegExp(`['"]${method}['"]|callNode\\(\\s*['"]${method}['"]`));
  }
});

test("preview geometry prefers the space above Composer, then avoids overlap and clamps to the viewport", () => {
  const viewport = { width: 1200, height: 800 };
  const anchor = { left: 300, top: 620, right: 900, bottom: 700 };
  const above = findPanelPosition({ anchor, width: 560, height: 420, viewport });
  assert.deepEqual(above, { left: 300, top: 188 });
  assert.equal(panelRectsOverlap(above.left, above.top, 560, 420, anchor), false);

  const nearTop = findPanelPosition({
    anchor: { left: 300, top: 20, right: 600, bottom: 100 },
    width: 560,
    height: 420,
    viewport,
  });
  assert.deepEqual(nearTop, { left: 612, top: 20 });

  const preferred = findPanelPosition({
    anchor,
    width: 560,
    height: 420,
    viewport,
    preferred: { left: 20, top: 20 },
  });
  assert.deepEqual(preferred, { left: 20, top: 20 });
  assert.deepEqual(normalizePanelSize(1000, 1000, { width: 640, height: 480 }), { width: 616, height: 456 });
  assert.equal(normalizePanelSize(undefined, undefined, { width: 900, height: 700 }).height, 360);
});

test("settings stylesheet centers the pane and follows Codex light and dark host classes", async () => {
  const css = await readFile(new URL("../src/style.css", import.meta.url), "utf8");
  assert.match(css, /\.ctpo-settings\s*\{(?=[^}]*width:\s*min\(100%,\s*760px\);)(?=[^}]*margin:\s*0 auto;)/s);
  assert.match(css, /:root:not\(\.electron-light\)\s+\[data-codex-tweaks-ct-prompt-optimizer\]/);
  assert.match(css, /\.ctpo-field\s*\{[^}]*grid-template-columns:\s*104px minmax\(0, 1fr\);/s);
  assert.match(css, /\.ctpo-panel-host\s*\{(?=[^}]*pointer-events:\s*none;)(?=[^}]*position:\s*fixed;)/s);
  assert.match(css, /\.ctpo-panel\s*\{(?=[^}]*resize:\s*both;)(?=[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto;)/s);
  assert.match(css, /\.ctpo-panel-preview\s*\{(?=[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\);)/s);
});

test("settings keeps API key drafts across visibility toggles and renders save feedback beside actions", async () => {
  const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(source, /keyDraft/);
  assert.match(source, /keyInput\.addEventListener\("input", \(\) => \{ view\.keyDraft = keyInput\.value; \}\)/);
  assert.match(source, /saveFeedback/);
  assert.match(source, /inlineNotice/);
  assert.match(source, /setInlineNotice/);
});
