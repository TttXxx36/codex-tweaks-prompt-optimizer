import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  captureComposerContext,
  findComposerCandidates,
  findModelPicker,
  isComposerCandidate,
  isSameComposerContext,
  readInputText,
  replaceInputText,
} from "../src/renderer-core.js";

class FakeElement {
  constructor(tagName, attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
    this.children = [];
    this.parentElement = null;
    this.value = attributes.value ?? "";
    this.textContent = attributes.textContent ?? "";
    this.innerText = this.textContent;
    this.isContentEditable = attributes.contenteditable === "true";
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
  const settings = new FakeElement("section", { "data-settings": "true" });
  const settingsInput = new FakeElement("textarea");
  settings.append(settingsInput);
  const history = new FakeElement("article", { "data-message-id": "message-1" });
  const historyEditor = new FakeElement("div", { contenteditable: "true" });
  history.append(historyEditor);
  assert.equal(isComposerCandidate(textarea), true);
  assert.equal(isComposerCandidate(editable), true);
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
  assert.match(source, /data-codex-tweaks-prompt-optimizer/);
  assert.match(source, /isSameComposerContext\(context/);
  for (const method of ["load-settings", "save-settings", "clear-api-key", "test-connection", "list-models", "optimize", "clarify-round", "list-history", "delete-history", "clear-history"]) {
    assert.match(source, new RegExp(`['"]${method}['"]|callNode\\(\\s*['"]${method}['"]`));
  }
});
