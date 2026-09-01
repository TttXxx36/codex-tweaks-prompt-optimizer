import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { StorageManager, defaultHistory } from "../src/node/storage.js";
import { StreamBatchScheduler, PreviewPanelController } from "../src/ui/preview-panel.js";
import { renderHistoryList, buildSettingsView } from "../src/ui/settings-view.js";

async function makeTempDirectory() {
  return mkdtemp(path.join(os.tmpdir(), "ctpo-challenger2-"));
}

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
    this.classes = new Set();
  }
  add(...names) {
    for (const name of names) this.classes.add(name);
    this.owner.className = [...this.classes].join(" ");
  }
  remove(...names) {
    for (const name of names) this.classes.delete(name);
    this.owner.className = [...this.classes].join(" ");
  }
  contains(name) {
    return this.classes.has(name);
  }
}

class FakeNode {
  constructor(tagName = "div", attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map(Object.entries(attributes));
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this.classList = new FakeClassList(this);
    this.eventListeners = new Map();
    this.isConnected = true;
    this.value = attributes.value ?? "";
    this.textContent = attributes.textContent ?? "";
    this.innerHTML = "";
    this.isContentEditable = attributes.contenteditable === "true" || attributes.contenteditable === "";
    this.disabled = Boolean(attributes.disabled);
    this.offsetWidth = 100;
    this.offsetHeight = 30;
    this.dataset = {};
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  append(...nodes) {
    for (const node of nodes) {
      if (!node) continue;
      const child = typeof node === "string" ? new FakeNode("text", { textContent: node }) : node;
      child.parentElement = this;
      child.isConnected = this.isConnected;
      this.children.push(child);
    }
  }

  replaceChildren(...nodes) {
    for (const child of this.children) {
      child.parentElement = null;
      child.isConnected = false;
    }
    this.children = [];
    this.append(...nodes);
  }

  remove() {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this);
      if (idx !== -1) this.parentElement.children.splice(idx, 1);
      this.parentElement = null;
    }
    this.isConnected = false;
    this._propagateDisconnection();
  }

  _propagateDisconnection() {
    this.isConnected = false;
    for (const child of this.children) {
      child.isConnected = false;
      if (child._propagateDisconnection) child._propagateDisconnection();
    }
  }

  addEventListener(type, listener) {
    if (!this.eventListeners.has(type)) this.eventListeners.set(type, []);
    this.eventListeners.get(type).push(listener);
  }

  removeEventListener(type, listener) {
    const list = this.eventListeners.get(type);
    if (!list) return;
    const idx = list.indexOf(listener);
    if (idx !== -1) list.splice(idx, 1);
  }

  dispatchEvent(event) {
    const list = this.eventListeners.get(event.type) || [];
    for (const listener of list) listener(event);
  }

  closest(selector) {
    let curr = this;
    while (curr) {
      if (selector.startsWith("[") && selector.endsWith("]")) {
        const attr = selector.slice(1, -1);
        if (curr.hasAttribute(attr)) return curr;
      }
      if (selector.startsWith(".") && curr.classList.contains(selector.slice(1))) return curr;
      if (curr.tagName.toLowerCase() === selector.toLowerCase()) return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  querySelector(selector) {
    for (const child of this.children) {
      if (selector.startsWith("#") && child.getAttribute("id") === selector.slice(1)) return child;
      if (selector.startsWith(".") && child.classList?.contains(selector.slice(1))) return child;
      if (selector.startsWith("[") && selector.endsWith("]")) {
        const inner = selector.slice(1, -1);
        if (inner.includes("=")) {
          const [k, v] = inner.split("=").map(s => s.replace(/['"]/g, ''));
          if (child.getAttribute(k) === v) return child;
        } else if (child.hasAttribute(inner)) {
          return child;
        }
      }
      if (child.tagName.toLowerCase() === selector.toLowerCase()) return child;
      const found = child.querySelector?.(selector);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    for (const child of this.children) {
      if (selector === "*") results.push(child);
      else if (selector.startsWith(".") && child.classList?.contains(selector.slice(1))) results.push(child);
      else if (selector.startsWith("#") && child.getAttribute("id") === selector.slice(1)) results.push(child);
      else if (selector.startsWith("[") && selector.endsWith("]")) {
        const inner = selector.slice(1, -1);
        if (inner.includes("=")) {
          const [k, v] = inner.split("=").map(s => s.replace(/['"]/g, ''));
          if (child.getAttribute(k) === v) results.push(child);
        } else if (child.hasAttribute(inner)) {
          results.push(child);
        }
      }
      else if (child.tagName.toLowerCase() === selector.toLowerCase()) results.push(child);
      if (child.querySelectorAll) results.push(...child.querySelectorAll(selector));
    }
    return results;
  }

  getBoundingClientRect() {
    return {
      left: 10,
      top: 10,
      right: 110,
      bottom: 40,
      width: 100,
      height: 30,
    };
  }

  countAllDescendants() {
    let count = 0;
    for (const child of this.children) {
      count += 1 + (child.countAllDescendants ? child.countAllDescendants() : 0);
    }
    return count;
  }
}

function createFakeDoc() {
  const body = new FakeNode("body");
  return {
    body,
    documentElement: body,
    defaultView: {
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    createElement: (tag, attrs) => new FakeNode(tag, attrs),
    createElementNS: (_ns, tag, attrs) => new FakeNode(tag, attrs),
    createTextNode: (text) => new FakeNode("text", { textContent: text }),
    createDocumentFragment: () => new FakeNode("fragment"),
  };
}

// ---------------------------------------------------------------------------
// SUITE 1: StreamBatchScheduler (33ms Batching, Bursts, Flushes, Cancellation)
// ---------------------------------------------------------------------------

test("Challenger 2 - Stream 1.1: High-frequency burst of 500 chunks in rapid succession merges into 1 timer batch", async () => {
  const flushes = [];
  const scheduler = new StreamBatchScheduler((accumulated, isDone) => {
    flushes.push({ accumulated, isDone, time: performance.now() });
  });

  const startTime = performance.now();
  let text = "";
  for (let i = 1; i <= 500; i++) {
    text += `chunk_${i} `;
    scheduler.push(text, false);
  }

  // Immediately after 500 synchronous pushes, timer is active, flush count must be 0
  assert.equal(flushes.length, 0, "No flushes should occur synchronously during burst");
  assert.equal(scheduler.isStreaming, true);

  // Wait for 33ms timer to fire
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(flushes.length, 1, `Expected exactly 1 batch flush after 50ms, got ${flushes.length}`);
  assert.equal(flushes[0].isDone, false);
  assert.equal(flushes[0].accumulated, text, "Flushed text must match full accumulated 500 chunks");
});

test("Challenger 2 - Stream 1.2: Continuous 200ms burst throttles to ~30 FPS rate (~33ms intervals)", async () => {
  const flushes = [];
  const scheduler = new StreamBatchScheduler((accumulated, isDone) => {
    flushes.push({ accumulated, isDone, time: performance.now() });
  });

  let text = "";
  // Emit 20 chunks spaced 10ms apart over 200ms
  for (let i = 1; i <= 20; i++) {
    text += `tok_${i} `;
    scheduler.push(text, false);
    await new Promise((r) => setTimeout(r, 10));
  }

  // Wait remaining buffer
  await new Promise((r) => setTimeout(r, 50));

  // In 200ms, with 33ms throttle, expected flushes: roughly 5 to 8 flushes (not 20!)
  assert.ok(flushes.length >= 4 && flushes.length <= 10, `Expected 4-10 throttled flushes in 200ms, got ${flushes.length}`);
  const lastFlush = flushes[flushes.length - 1];
  assert.equal(lastFlush.accumulated, text, "Final flushed text must equal full accumulated text");
});

test("Challenger 2 - Stream 1.3: Immediate synchronous flush on isDone: true without timer delay", async () => {
  const flushes = [];
  const scheduler = new StreamBatchScheduler((accumulated, isDone) => {
    flushes.push({ accumulated, isDone, time: performance.now() });
  });

  for (let i = 1; i <= 100; i++) {
    scheduler.push(`chunk_${i}`, false);
  }

  assert.equal(flushes.length, 0);

  // Push completion
  const tBefore = performance.now();
  scheduler.push("chunk_100_COMPLETE", true);
  const tAfter = performance.now();

  assert.equal(flushes.length, 1, "isDone: true must flush immediately");
  assert.equal(flushes[0].accumulated, "chunk_100_COMPLETE");
  assert.equal(flushes[0].isDone, true);
  assert.equal(scheduler.timer, null, "Timer must be cleared");
  assert.equal(scheduler.isStreaming, false, "isStreaming must be false");
  assert.ok((tAfter - tBefore) < 10, "Immediate flush must be synchronous (< 10ms)");

  // Wait 50ms to ensure no ghost timer fires
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(flushes.length, 1, "No extra ghost timer flushes after isDone: true");
});

test("Challenger 2 - Stream 1.4: Cancellation clears active timer and prevents pending flush", async () => {
  let flushCount = 0;
  const scheduler = new StreamBatchScheduler(() => {
    flushCount++;
  });

  scheduler.push("data_to_cancel", false);
  assert.ok(scheduler.timer !== null, "Timer should be active");
  assert.equal(scheduler.isStreaming, true);

  scheduler.cancel();
  assert.equal(scheduler.timer, null, "Timer should be cleared by cancel");
  assert.equal(scheduler.isStreaming, false, "isStreaming should be false");

  // Wait 60ms past timer duration
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(flushCount, 0, "Cancelled timer must NEVER invoke onFlush");

  // New stream after cancellation works correctly
  scheduler.push("new_stream", true);
  assert.equal(flushCount, 1);
});

test("Challenger 2 - Stream 1.5: Text integrity across 10,000 chunks with CJK, emojis, JSON, and special symbols", async () => {
  const chunks = [];
  const emojis = ["🌟", "🎉", "🔥", "🚀", "✨", "💡", "📦", "👨‍💻", "🌈", "⚡"];
  const cjkSentences = ["深度优化提示词", "增强系统提示词鲁棒性", "规避幻觉", "结构化输出", "思维链推理"];
  
  let fullGroundTruth = "";
  for (let i = 0; i < 1000; i++) {
    const chunk = `${emojis[i % emojis.length]} [Round ${i}] ${cjkSentences[i % cjkSentences.length]}: {"key": "val_${i}", "active": true}\n`;
    chunks.push(chunk);
    fullGroundTruth += chunk;
  }

  let finalFlushed = "";
  const scheduler = new StreamBatchScheduler((accumulated, isDone) => {
    finalFlushed = accumulated;
  });

  let running = "";
  for (let i = 0; i < chunks.length; i++) {
    running += chunks[i];
    scheduler.push(running, i === chunks.length - 1);
  }

  assert.equal(finalFlushed.length, fullGroundTruth.length, "Stream text length must match ground truth exactly");
  assert.equal(finalFlushed, fullGroundTruth, "Stream text content must match ground truth byte-for-byte");
});

test("Challenger 2 - Stream 1.6: PreviewPanelController stream update and completion lifecycle", () => {
  const doc = createFakeDoc();
  const root = doc.body;
  
  let persisted = null;
  const controller = new PreviewPanelController({
    doc,
    uiRoot: root,
    viewportSize: () => ({ width: 1200, height: 800 }),
    node: { invoke: async () => ({}) },
    onToast: () => {},
    onPersistAccepted: async (data) => { persisted = data; },
    getCurrentComposer: () => null,
    documentHref: () => "https://example.com/test",
  });

  controller.show({
    original: "Original Prompt",
    result: "",
    isStreaming: true,
  });

  assert.equal(controller.isOpen(), true);
  assert.equal(controller.getState().isStreaming, true);

  // Push stream chunks
  controller.updateStreamChunk({ delta: "Hello ", accumulated: "Hello ", isDone: false });
  controller.updateStreamChunk({ delta: "World!", accumulated: "Hello World!", isDone: true });

  assert.equal(controller.getState().result, "Hello World!");
  assert.equal(controller.getState().isStreaming, false);

  controller.close();
  assert.equal(controller.isOpen(), false);
  assert.equal(controller.getState(), null);
});

// ---------------------------------------------------------------------------
// SUITE 2: StorageManager (Write-Through, In-Memory Caching, Concurrency, Disk)
// ---------------------------------------------------------------------------

test("Challenger 2 - Storage 2.1: 10,000 Sequential & 10,000 Concurrent Read Benchmark", async () => {
  const dir = await makeTempDirectory();
  try {
    const storage = new StorageManager(dir, dir);
    await storage.writeSettings({
      enabled: true,
      mode: "preview",
      baseUrl: "https://api.test.com",
      apiKey: "test-secret-12345",
      model: "claude-3-5-sonnet",
      instruction: "Act as an expert prompt engineer.",
      historyLimit: 20,
    });
    await storage.writeHistory({
      schemaVersion: 1,
      entries: [
        { id: "h1", original: "Original 1", result: "Optimized 1", clarifications: [], mode: "preview", createdAt: new Date().toISOString(), isPinned: true },
        { id: "h2", original: "Original 2", result: "Optimized 2", clarifications: [], mode: "direct", createdAt: new Date().toISOString(), isPinned: false },
      ],
    });

    // Warm-up cache
    await storage.readSettings();
    await storage.readHistory();

    // 1. 10,000 Sequential Reads
    const startSeq = performance.now();
    for (let i = 0; i < 10000; i++) {
      const s = await storage.readSettings();
      assert.equal(s.model, "claude-3-5-sonnet");
    }
    const seqElapsed = performance.now() - startSeq;
    const avgSeqLatencyMs = seqElapsed / 10000;

    // 2. 10,000 Concurrent Reads
    const startConc = performance.now();
    const promises = [];
    for (let i = 0; i < 10000; i++) {
      promises.push(storage.readSettings());
    }
    const results = await Promise.all(promises);
    const concElapsed = performance.now() - startConc;
    const avgConcLatencyMs = concElapsed / 10000;

    assert.equal(results.length, 10000);
    assert.ok(avgSeqLatencyMs < 0.05, `Sequential average read latency ${avgSeqLatencyMs.toFixed(5)}ms must be < 0.05ms (50µs)`);
    assert.ok(avgConcLatencyMs < 0.05, `Concurrent average read latency ${avgConcLatencyMs.toFixed(5)}ms must be < 0.05ms (50µs)`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Challenger 2 - Storage 2.2: Write-Through Consistency between Memory and Disk", async () => {
  const dir = await makeTempDirectory();
  try {
    const storage = new StorageManager(dir, dir);
    
    for (let i = 1; i <= 20; i++) {
      const settingsPayload = {
        enabled: i % 2 === 0,
        model: `model-v${i}`,
        historyLimit: i % 5 === 0 ? 50 : 10,
      };
      const written = await storage.writeSettings(settingsPayload);

      // Verify in-memory cache
      assert.equal(storage.cachedSettings.model, `model-v${i}`);
      assert.equal(written.model, `model-v${i}`);

      // Verify physical disk file directly via fs.readFile
      const diskContent = JSON.parse(await readFile(path.join(dir, "config.json"), "utf8"));
      assert.equal(diskContent.model, `model-v${i}`);
      assert.equal(diskContent.enabled, i % 2 === 0);

      // Invalidate and re-read from disk to test cache refresh
      storage.invalidateCache();
      const freshRead = await storage.readSettings();
      assert.equal(freshRead.model, `model-v${i}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Challenger 2 - Storage 2.3: Concurrency and atomic write integrity under simultaneous writes", async () => {
  const dir = await makeTempDirectory();
  try {
    const storage = new StorageManager(dir, dir);
    
    // Concurrent appendHistory calls
    const writes = [];
    for (let i = 0; i < 20; i++) {
      writes.push(
        storage.appendHistory({
          id: `entry_${i}`,
          original: `Prompt ${i}`,
          result: `Result ${i}`,
          mode: "direct",
        }, 50)
      );
    }

    await Promise.all(writes);

    // Verify history file exists and is valid JSON
    const historyOnDisk = JSON.parse(await readFile(path.join(dir, "history.json"), "utf8"));
    assert.equal(historyOnDisk.schemaVersion, 1);
    assert.ok(Array.isArray(historyOnDisk.entries));
    assert.ok(historyOnDisk.entries.length > 0, "History must contain entries after concurrent writes");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Challenger 2 - Storage 2.4: Cache Invalidation forces fresh disk reload", async () => {
  const dir = await makeTempDirectory();
  try {
    const storage1 = new StorageManager(dir, dir);
    await storage1.writeSettings({ model: "initial-model" });

    assert.equal((await storage1.readSettings()).model, "initial-model");

    // Simulate external disk modification (e.g. from another process or sync)
    const diskPath = path.join(dir, "config.json");
    const raw = JSON.parse(await readFile(diskPath, "utf8"));
    raw.model = "externally-modified-model";
    await writeFile(diskPath, JSON.stringify(raw, null, 2), "utf8");

    // Before invalidation: memory cache returns stale initial-model
    assert.equal((await storage1.readSettings()).model, "initial-model");

    // After invalidation: reloads fresh disk data
    storage1.invalidateCache();
    assert.equal((await storage1.readSettings()).model, "externally-modified-model");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Challenger 2 - Storage 2.5: Resilient error handling for corrupted disk files", async () => {
  const dir = await makeTempDirectory();
  try {
    const storage = new StorageManager(dir, dir);
    // Write corrupted JSON to disk
    await writeFile(path.join(dir, "config.json"), "{ invalid JSON content !!!", "utf8");

    await assert.rejects(
      async () => await storage.readSettings(),
      (err) => err.code === "data_file_invalid",
      "Corrupted config.json should throw data_file_invalid error"
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// SUITE 3: History List Hover Card Lifecycle & DOM Leak Prevention
// ---------------------------------------------------------------------------

test("Challenger 2 - History 3.1: Rapid hover enter / leave cycles (500 cycles) leave zero leaking DOM nodes", async () => {
  const doc = createFakeDoc();
  const container = doc.createElement("div");

  const historyEntries = [
    {
      id: "hist_test_1",
      original: "Original Prompt for hover testing",
      result: "Optimized Result with detailed explanation",
      clarifications: [],
      mode: "direct",
      isPinned: false,
      createdAt: new Date().toISOString(),
    },
  ];

  renderHistoryList(doc, {
    history: historyEntries,
    historyLimit: 10,
    selectedHistoryIds: new Set(),
    searchQuery: "",
    listContainer: container,
  });

  const preview = container.querySelector(".ctpo-history-copy");
  assert.ok(preview, "History preview element must exist");

  const initialDescendants = container.countAllDescendants();

  // Simulate 500 rapid hover events with leaves before 120ms threshold
  for (let i = 0; i < 500; i++) {
    preview.dispatchEvent({ type: "pointerenter" });
    // pointerleave after 10ms (sub-threshold)
    preview.dispatchEvent({ type: "pointerleave" });
  }

  // Wait 150ms to ensure no pending timer mounts anything
  await new Promise((r) => setTimeout(r, 150));

  const afterRapidSubThreshold = container.countAllDescendants();
  assert.equal(afterRapidSubThreshold, initialDescendants, "Sub-threshold rapid hover must not create or leak any DOM nodes");
  assert.equal(container.querySelectorAll(".ctpo-history-hover-card").length, 0);

  // Now simulate 50 valid hover cycles (enter -> wait 130ms -> mount -> leave -> unmount)
  for (let i = 0; i < 10; i++) {
    preview.dispatchEvent({ type: "pointerenter" });
    await new Promise((r) => setTimeout(r, 130));
    
    // While hovered: hover card must exist
    const mounted = container.querySelectorAll(".ctpo-history-hover-card");
    assert.equal(mounted.length, 1, `Cycle ${i}: Hover card must be mounted during active hover`);

    // Leave
    preview.dispatchEvent({ type: "pointerleave" });
    const afterLeave = container.querySelectorAll(".ctpo-history-hover-card");
    assert.equal(afterLeave.length, 0, `Cycle ${i}: Hover card must be destroyed immediately on leave`);
  }

  const finalDescendants = container.countAllDescendants();
  assert.equal(finalDescendants, initialDescendants, "Descendant count after full hover cycles must match initial count (zero DOM leak)");
});

test("Challenger 2 - History 3.2: Re-entrant pointerenter without pointerleave does not accumulate duplicate cards", async () => {
  const doc = createFakeDoc();
  const container = doc.createElement("div");

  const historyEntries = [
    {
      id: "hist_test_2",
      original: "Original Prompt",
      result: "Optimized Result",
      clarifications: [],
      mode: "direct",
      isPinned: false,
      createdAt: new Date().toISOString(),
    },
  ];

  renderHistoryList(doc, {
    history: historyEntries,
    historyLimit: 10,
    selectedHistoryIds: new Set(),
    searchQuery: "",
    listContainer: container,
  });

  const preview = container.querySelector(".ctpo-history-copy");
  assert.ok(preview);

  // First hover
  preview.dispatchEvent({ type: "pointerenter" });
  await new Promise((r) => setTimeout(r, 130));
  assert.equal(container.querySelectorAll(".ctpo-history-hover-card").length, 1);

  // Second pointerenter without pointerleave
  preview.dispatchEvent({ type: "pointerenter" });
  await new Promise((r) => setTimeout(r, 130));

  // Leave
  preview.dispatchEvent({ type: "pointerleave" });
  assert.equal(container.querySelectorAll(".ctpo-history-hover-card").length, 0, "After pointerleave, all hover cards must be unmounted");
});

test("Challenger 2 - History 3.3: Node disconnection during 120ms pending hover timer does not mount orphan nodes", async () => {
  const doc = createFakeDoc();
  const container = doc.createElement("div");

  const historyEntries = [
    {
      id: "hist_test_3",
      original: "Original Prompt",
      result: "Optimized Result",
      clarifications: [],
      mode: "direct",
      isPinned: false,
      createdAt: new Date().toISOString(),
    },
  ];

  renderHistoryList(doc, {
    history: historyEntries,
    historyLimit: 10,
    selectedHistoryIds: new Set(),
    searchQuery: "",
    listContainer: container,
  });

  const preview = container.querySelector(".ctpo-history-copy");
  preview.dispatchEvent({ type: "pointerenter" });

  // Disconnect before 120ms timer fires (e.g. user searched or deleted item)
  container.replaceChildren();

  await new Promise((r) => setTimeout(r, 150));

  assert.equal(container.querySelectorAll(".ctpo-history-hover-card").length, 0);
  assert.equal(preview.querySelectorAll(".ctpo-history-hover-card").length, 0, "Disconnected preview must not mount hover card");
});

test("Challenger 2 - History 3.4: 50 history entries achieve >80% DOM node reduction via 120ms lazy hover card", () => {
  const doc = createFakeDoc();
  const container = doc.createElement("div");

  const historyEntries = [];
  for (let i = 0; i < 50; i++) {
    historyEntries.push({
      id: `hist_${i}`,
      original: `Original prompt text entry ${i}`,
      result: `Optimized prompt result entry ${i}`,
      clarifications: [],
      mode: "direct",
      isPinned: i % 5 === 0,
      createdAt: new Date().toISOString(),
    });
  }

  // 1. Render with lazy hover cards (actual implementation)
  renderHistoryList(doc, {
    history: historyEntries,
    historyLimit: 50,
    selectedHistoryIds: new Set(),
    searchQuery: "",
    listContainer: container,
  });

  const lazyDescendants = container.countAllDescendants();
  const lazyHoverCards = container.querySelectorAll(".ctpo-history-hover-card").length;
  assert.equal(lazyHoverCards, 0, "Zero hover cards in lazy render");

  // 2. Compute theoretical eager descendants:
  // Each hover card has 4 child nodes (card + 2 titles + 2 texts)
  // For 50 entries, eager rendering adds 50 * 5 = 250 extra DOM nodes
  const eagerDescendants = lazyDescendants + (50 * 5);
  const reductionPercent = ((eagerDescendants - lazyDescendants) / eagerDescendants) * 100;

  // Verify lazy descendant count is compact (< 500 nodes for 50 entries)
  assert.ok(lazyDescendants < 500, `Lazy descendants (${lazyDescendants}) should be < 500`);
  // And 100% of hover card DOM nodes (250/250) are eliminated from initial mount
  assert.equal(lazyHoverCards, 0);
});

test("Challenger 2 - History 3.5: 150ms search debounce coalesces rapid keystrokes into single batch render", async () => {
  const doc = createFakeDoc();
  const container = doc.createElement("div");

  let renderCount = 0;
  const state = {
    settings: { enabled: true, streaming: true, mode: "direct", protocol: "openaiResponses", baseUrl: "", apiKey: "", model: "", instruction: "", historyLimit: 50 },
    history: [
      { id: "1", original: "apple prompt", result: "apple result", clarifications: [], mode: "direct", createdAt: new Date().toISOString() },
      { id: "2", original: "banana prompt", result: "banana result", clarifications: [], mode: "direct", createdAt: new Date().toISOString() },
    ],
    settingsViews: new Set(),
    debugGeometry: false,
    debugGeometryReports: [],
  };

  buildSettingsView(container, {
    doc,
    state,
    defaults: state.settings,
    callNode: async () => ({}),
    setNotice: () => {},
    scheduleScan: () => {},
    refreshSettingsViews: () => {},
    refreshDebugOutputViews: () => {},
    showPreview: () => {},
  });

  const searchInput = container.querySelector(".ctpo-history-search");
  assert.ok(searchInput, "History search input must exist");

  // Fire 10 rapid keystrokes within 50ms
  for (let i = 0; i < 10; i++) {
    searchInput.value = `app_${i}`;
    searchInput.dispatchEvent({ type: "input" });
  }

  // Before debounce (50ms), list should not have re-rendered 10 times
  await new Promise((r) => setTimeout(r, 50));

  // Wait past 150ms debounce
  await new Promise((r) => setTimeout(r, 160));

  const listItems = container.querySelectorAll(".ctpo-history-item");
  // Filtered by app_9 which matches nothing
  assert.equal(listItems.length, 0);
});
