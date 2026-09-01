import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import {
  isComposerCandidate,
  isExcludedFromComposer,
  findComposerCandidates,
  readInputText,
  replaceInputText,
} from "../src/renderer-core.js";
import { computeLcsDiff, TokenPool } from "../src/ui/dom.js";
import { StorageManager } from "../src/node/storage.js";
import { extractStreamDelta } from "../src/node/provider.js";

class BenchmarkFakeElement {
  constructor(tagName, attributes = {}, parent = null) {
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
    this.children = [];
    this.parentElement = parent;
    this.value = attributes.value ?? "";
    this.textContent = attributes.textContent ?? "";
    this.innerText = this.textContent;
    this.isContentEditable = attributes.contenteditable === "true" || attributes.contenteditable === "plaintext-only";
    this.contentEditable = attributes.contenteditable ?? "inherit";
    this.isConnected = true;
    this.ownerDocument = {
      defaultView: {
        location: { href: "https://codex.test/conversation/benchmark" },
        getComputedStyle: () => ({ display: "block", visibility: "visible" }),
        Event: class Event { constructor(type) { this.type = type; } },
      },
    };
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

  hasAttribute(name) {
    return this.attributes[name] !== undefined;
  }

  matches(selector) {
    if (selector.includes("dialog") && this.tagName === "DIALOG") return true;
    if (selector.includes("[data-settings]") && this.hasAttribute("data-settings")) return true;
    if (selector.includes("[role=menu]") && this.getAttribute("role") === "menu") return true;
    if (selector.includes("[role=listbox]") && this.getAttribute("role") === "listbox") return true;
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
}

test("Benchmark: DOM 候选扫描与 WeakMap 排除快排性能", () => {
  const root = new BenchmarkFakeElement("main");
  const candidates = [];

  // Generate a complex mock DOM tree with 150 elements
  for (let i = 0; i < 50; i++) {
    const dialog = new BenchmarkFakeElement("div", { role: "dialog" }, root);
    const dialogInput = new BenchmarkFakeElement("textarea", {}, dialog);
    dialog.append(dialogInput);
    root.append(dialog);

    const normalWrapper = new BenchmarkFakeElement("div", { "data-composer": "true" }, root);
    const validComposer = new BenchmarkFakeElement("textarea", { placeholder: "Prompt" }, normalWrapper);
    normalWrapper.append(validComposer);
    root.append(normalWrapper);

    const menu = new BenchmarkFakeElement("div", { role: "menu" }, root);
    const menuItem = new BenchmarkFakeElement("div", { role: "menuitem", contenteditable: "true" }, menu);
    menu.append(menuItem);
    root.append(menu);

    candidates.push(dialogInput, validComposer, menuItem);
  }

  const start = performance.now();
  const iterations = 50;
  for (let iter = 0; iter < iterations; iter++) {
    for (const el of candidates) {
      isComposerCandidate(el);
    }
  }
  const duration = performance.now() - start;
  const avgScanTime = duration / iterations;

  assert.ok(avgScanTime < 5, `DOM 候选扫描平均耗时 (${avgScanTime.toFixed(2)}ms) 超过预期 5ms`);
});

test("Benchmark: Myers Diff 算法与长文本分级降级性能", () => {
  const sampleWords = ["prompt", "optimizer", "function", "const", "return", "class", "element", "import", "export", "token", "model", "temperature", "stream"];

  const generateTokens = (count) => {
    const tokens = [];
    for (let i = 0; i < count; i++) {
      tokens.push(sampleWords[i % sampleWords.length] + (i % 7 === 0 ? " " : ""));
    }
    return tokens;
  };

  // 1. Medium text: 1,000 tokens
  const t1_1k = generateTokens(1000);
  const t2_1k = [...t1_1k];
  t2_1k[100] = "MODIFIED_TOKEN_1 ";
  t2_1k[500] = "MODIFIED_TOKEN_2 ";
  t2_1k.splice(200, 10); // delete 10
  t2_1k.splice(800, 0, "INSERTED_1 ", "INSERTED_2 "); // add 2

  const start1k = performance.now();
  const diff1k = computeLcsDiff(t1_1k, t2_1k);
  const duration1k = performance.now() - start1k;
  assert.ok(diff1k.length > 0);
  assert.ok(duration1k < 15, `1000 Token Diff 耗时 (${duration1k.toFixed(2)}ms) 应小于 15ms`);

  // 2. Large text: 5,000 tokens
  const t1_5k = generateTokens(5000);
  const t2_5k = [...t1_5k];
  t2_5k[1000] = "MODIFIED_5K ";
  t2_5k.splice(3000, 20);

  const start5k = performance.now();
  const diff5k = computeLcsDiff(t1_5k, t2_5k);
  const duration5k = performance.now() - start5k;
  assert.ok(diff5k.length > 0);
  assert.ok(duration5k < 35, `5000 Token Diff 耗时 (${duration5k.toFixed(2)}ms) 应小于 35ms`);

  // 3. Super long text: 15,000 tokens (automatic line-level degradation)
  const t1_15k = generateTokens(15000);
  const t2_15k = [...t1_15k];
  t2_15k[5000] = "SUPER_LONG_DIFF ";

  const start15k = performance.now();
  const diff15k = computeLcsDiff(t1_15k, t2_15k);
  const duration15k = performance.now() - start15k;
  assert.ok(diff15k.length > 0);
  assert.ok(duration15k < 30, `15,000 Token 自动降级 Diff 耗时 (${duration15k.toFixed(2)}ms) 应小于 30ms`);
});

test("Benchmark: StorageManager 内存驻留缓存吞吐量", async () => {
  const storage = new StorageManager(undefined, undefined);

  // Initialize cache
  await storage.readSettings();
  await storage.readHistory();

  const start = performance.now();
  const iterations = 5000;
  for (let i = 0; i < iterations; i++) {
    const settings = await storage.readSettings();
    assert.equal(settings.enabled, true);
  }
  const duration = performance.now() - start;
  const avgReadMs = duration / iterations;

  assert.ok(avgReadMs < 0.01, `StorageManager 内存读单次耗时 (${(avgReadMs * 1000).toFixed(2)}µs) 应小于 10µs`);
});

test("Benchmark: SSE 极速流式 chunk 解析吞吐量", () => {
  const chunks = [];
  for (let i = 0; i < 2000; i++) {
    chunks.push({
      choices: [{ delta: { content: `token_${i} ` } }],
    });
  }

  const start = performance.now();
  let accumulated = "";
  for (const chunk of chunks) {
    const delta = extractStreamDelta("openaiChatCompletions", chunk);
    accumulated += delta;
  }
  const duration = performance.now() - start;

  assert.equal(accumulated.startsWith("token_0 "), true);
  assert.ok(duration < 10, `2,000 SSE Chunk 解析耗时 (${duration.toFixed(2)}ms) 应小于 10ms`);
});
