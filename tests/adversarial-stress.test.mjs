import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test, { describe } from "node:test";
import {
  TokenPool,
  computeLcsDiff,
  renderSimpleDiff,
} from "../src/ui/dom.js";
import {
  isComposerCandidate,
  isExcludedFromComposer,
  findComposerCandidates,
  findBestComposer,
  isElementVisible,
  getComposerButtonPosition,
  replaceInputText,
  readInputText,
} from "../src/renderer-core.js";

// Helper for reconstructing sequences from diff operations
function reconstructDiff(diff) {
  const reconstructedA = diff
    .filter((d) => d.type === "same" || d.type === "del")
    .map((d) => d.text);
  const reconstructedB = diff
    .filter((d) => d.type === "same" || d.type === "add")
    .map((d) => d.text);
  return { a: reconstructedA, b: reconstructedB };
}

function getNodeText(node) {
  if (!node) return "";
  if (node.children.length === 0) return node.textContent ?? "";
  return node.children.map(getNodeText).join("");
}

// Lightweight DOM Mock for Stress & Pathological Tree Tests
class StressNode {
  constructor(tagName = "div", attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map(Object.entries(attributes));
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this.isConnected = true;
    this.value = attributes.value ?? "";
    this.textContent = attributes.textContent ?? "";
    this.isContentEditable =
      attributes.contenteditable === "true" ||
      attributes.contenteditable === "" ||
      attributes.contenteditable === "plaintext-only";
    this.disabled = Boolean(attributes.disabled);
    this.readOnly = Boolean(attributes.readOnly);
    this.hidden = Boolean(attributes.hidden);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "contenteditable") {
      this.isContentEditable =
        value === "true" || value === "" || value === "plaintext-only";
    }
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "contenteditable") {
      this.isContentEditable = false;
    }
  }

  append(...nodes) {
    for (const node of nodes) {
      if (!node) continue;
      if (typeof node === "string") {
        const child = new StressNode("text", { textContent: node });
        child.parentElement = this;
        this.children.push(child);
      } else if (node.tagName === "FRAGMENT") {
        // Standard DocumentFragment behavior: unpack children into container
        for (const child of node.children) {
          child.parentElement = this;
          this.children.push(child);
        }
        node.children = [];
      } else {
        node.parentElement = this;
        this.children.push(node);
      }
    }
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  closest(selector) {
    let curr = this;
    const selectorList = selector.split(",").map((s) => s.trim());
    while (curr) {
      for (const sel of selectorList) {
        if (sel.startsWith("[") && sel.endsWith("]")) {
          const inner = sel.slice(1, -1);
          if (inner.includes("=")) {
            const [k, v] = inner.split("=");
            const cleanV = v.replace(/^["']|["']$/g, "");
            if (curr.getAttribute(k) === cleanV) return curr;
          } else if (inner.includes("*=")) {
            const [k, v] = inner.split("*=");
            const cleanV = v.replace(/^["']|["']$/g, "");
            if (curr.getAttribute(k)?.includes(cleanV)) return curr;
          } else {
            if (curr.hasAttribute(inner)) return curr;
          }
        } else if (sel.startsWith(".")) {
          const cls = sel.slice(1);
          if (curr.getAttribute("class")?.split(/\s+/).includes(cls)) return curr;
        } else if (curr.tagName.toLowerCase() === sel.toLowerCase()) {
          return curr;
        }
      }
      curr = curr.parentElement;
    }
    return null;
  }

  matches(selector) {
    return Boolean(this.closest(selector) === this);
  }

  querySelectorAll(selector) {
    const results = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (selector === "*") {
          results.push(child);
        } else {
          const tags = selector.split(",").map((s) => s.trim().toLowerCase());
          for (const t of tags) {
            if (t === child.tagName.toLowerCase()) {
              results.push(child);
              break;
            } else if (t.startsWith("[") && t.endsWith("]")) {
              const attr = t.slice(1, -1);
              if (attr.includes("=")) {
                const [k, v] = attr.split("=");
                if (child.getAttribute(k) === v) {
                  results.push(child);
                  break;
                }
              } else if (child.hasAttribute(attr)) {
                results.push(child);
                break;
              }
            }
          }
        }
        if (child.children.length > 0) {
          walk(child);
        }
      }
    };
    walk(this);
    return results;
  }
}

function createStressDoc() {
  const body = new StressNode("body");
  const doc = {
    body,
    documentElement: body,
    createElement: (tag, attrs) => {
      const node = new StressNode(tag, attrs);
      node.ownerDocument = doc;
      return node;
    },
    createTextNode: (text) => {
      const node = new StressNode("text", { textContent: text });
      node.ownerDocument = doc;
      return node;
    },
    createDocumentFragment: () => {
      const node = new StressNode("fragment");
      node.ownerDocument = doc;
      return node;
    },
  };
  body.ownerDocument = doc;
  return doc;
}

describe("ADVERSARIAL SUITE 1: DOM Candidate Scanning & WeakMap Caching", () => {
  test("Stress 1.1: Deeply nested DOM structure (depth = 100) candidate lookup and exclusion", () => {
    const doc = createStressDoc();
    let current = doc.body;

    for (let d = 0; d < 100; d++) {
      const div = doc.createElement("div", { "data-level": String(d) });
      current.append(div);
      current = div;
    }

    const textarea = doc.createElement("textarea", {
      placeholder: "Ask something deep",
      "data-composer": "true",
    });
    current.append(textarea);

    const start = performance.now();
    const isCand = isComposerCandidate(textarea);
    const isExcl = isExcludedFromComposer(textarea);
    const elapsed = performance.now() - start;

    assert.equal(isCand, true, "Deeply nested textarea must be recognized as composer candidate");
    assert.equal(isExcl, false, "Deeply nested textarea must not be excluded");
    assert.ok(elapsed < 10.0, `Deep DOM traversal took ${elapsed.toFixed(3)}ms (expected < 10ms)`);

    const ancestorAt50 = doc.body.querySelectorAll("div")[49];
    ancestorAt50.setAttribute("aria-modal", "true");

    const deepCandidate2 = doc.createElement("div", {
      contenteditable: "true",
      role: "textbox",
    });
    current.append(deepCandidate2);

    assert.equal(isComposerCandidate(deepCandidate2), false, "Candidate inside aria-modal ancestor must be excluded");
    assert.equal(isExcludedFromComposer(deepCandidate2), true, "Candidate inside aria-modal ancestor isExcludedFromComposer must be true");
  });

  test("Stress 1.2: Massive DOM tree (1,000+ non-candidate elements) scanning throughput", () => {
    const doc = createStressDoc();
    const root = doc.body;

    for (let i = 0; i < 200; i++) {
      const form = doc.createElement("form", { class: "settings-form" });
      form.append(
        doc.createElement("input", { type: "text", value: `input_${i}` }),
        doc.createElement("input", { type: "password", value: "secret" }),
        doc.createElement("div", { role: "menu", "data-menu-id": String(i) }),
        doc.createElement("div", { role: "listbox" }),
        doc.createElement("button", { type: "button", textContent: "Submit" })
      );
      root.append(form);
    }

    const valid1 = doc.createElement("textarea", { placeholder: "Send a message", "data-composer": "main" });
    const valid2 = doc.createElement("div", { contenteditable: "true", role: "textbox", "data-composer-placement": "chat" });
    const valid3 = doc.createElement("div", { contenteditable: "plaintext-only", "aria-label": "Composer input" });

    root.children[10].append(valid1);
    root.children[100].append(valid2);
    root.children[180].append(valid3);

    const allNodes = root.querySelectorAll("*");
    assert.ok(allNodes.length >= 1000, `Constructed nodes count ${allNodes.length} must be >= 1000`);

    const start = performance.now();
    const candidates = findComposerCandidates(root);
    const elapsed = performance.now() - start;

    assert.equal(candidates.length, 3, "Must discover exactly 3 valid composer candidates in 1000-element tree");
    assert.ok(elapsed < 10.0, `Scanning 1000+ elements took ${elapsed.toFixed(3)}ms (expected < 10ms)`);

    const best = findBestComposer(root);
    assert.ok(best === valid1 || best === valid2, "Best composer must be one of the top scored elements");
  });

  test("Stress 1.3: Edge-case candidate attributes (disabled, readonly, aria-disabled, hidden, plaintext-only, role=textbox)", () => {
    const doc = createStressDoc();

    const tDisabled = doc.createElement("textarea", { disabled: true });
    assert.equal(isComposerCandidate(tDisabled), false, "Disabled textarea must NOT be candidate");

    const tReadOnly = doc.createElement("textarea", { readOnly: true });
    assert.equal(isComposerCandidate(tReadOnly), false, "ReadOnly textarea must NOT be candidate");

    const tAriaDisabled = doc.createElement("textarea", { "aria-disabled": "true" });
    assert.equal(isComposerCandidate(tAriaDisabled), false, "aria-disabled textarea must NOT be candidate");

    const tHidden = doc.createElement("textarea", { hidden: true });
    assert.equal(isComposerCandidate(tHidden), false, "Hidden textarea must NOT be candidate");

    const ceFalse = doc.createElement("div", { contenteditable: "false" });
    assert.equal(isComposerCandidate(ceFalse), false, "contenteditable=false must NOT be candidate");

    const cePlaintext = doc.createElement("div", { contenteditable: "plaintext-only" });
    assert.equal(isComposerCandidate(cePlaintext), true, "contenteditable=plaintext-only MUST be candidate");

    const inputField = doc.createElement("input", { type: "text", role: "textbox" });
    assert.equal(isComposerCandidate(inputField), false, "input tag must NEVER be candidate even with role=textbox");

    assert.equal(isComposerCandidate(null), false);
    assert.equal(isComposerCandidate(undefined), false);
    assert.equal(isComposerCandidate("string"), false);
    assert.equal(isComposerCandidate(123), false);
    assert.equal(isComposerCandidate({}), false);
  });

  test("Stress 1.4: WeakMap caching stability and repeated query throughput", () => {
    const doc = createStressDoc();
    const elements = [];
    for (let i = 0; i < 100; i++) {
      const el = doc.createElement("div", { role: i % 2 === 0 ? "menu" : "button" });
      elements.push(el);
    }

    for (const el of elements) {
      isExcludedFromComposer(el);
    }

    const startWarm = performance.now();
    for (let repeat = 0; repeat < 100; repeat++) {
      for (const el of elements) {
        isExcludedFromComposer(el);
      }
    }
    const elapsedWarm = performance.now() - startWarm;
    const avgQueryUs = (elapsedWarm / 10000) * 1000;

    assert.ok(avgQueryUs < 0.5, `Warm cache average query latency ${avgQueryUs.toFixed(4)}µs should be < 0.5µs`);
  });

  test("Stress 1.5: Button positioning math under pathological / extreme coordinates", () => {
    const pos1 = getComposerButtonPosition(
      { left: 200, top: 100, width: 50, height: 32 },
      { width: 80, height: 32 },
      { width: 1920, height: 1080 }
    );
    assert.equal(pos1.left, 200 - 80 - 24);
    assert.equal(pos1.top, 100);

    const posLeftClamp = getComposerButtonPosition(
      { left: 20, top: 100, width: 50, height: 32 },
      { width: 80, height: 32 },
      { width: 1920, height: 1080 }
    );
    assert.equal(posLeftClamp.left, 4, "Must clamp to minimum left = 4");

    const posTopClamp = getComposerButtonPosition(
      { left: 500, top: -50, width: 50, height: 32 },
      { width: 80, height: 32 },
      { width: 1920, height: 1080 }
    );
    assert.equal(posTopClamp.top, 4, "Must clamp to minimum top = 4");

    assert.equal(getComposerButtonPosition(null), null);
    assert.equal(getComposerButtonPosition({ left: NaN, top: 10 }), null);
    assert.equal(getComposerButtonPosition({ left: 100, top: 100, height: 0 }), null);
  });
});

describe("ADVERSARIAL SUITE 2: Myers Diff Engine Under Pathological Inputs", () => {
  test("Stress 2.1: Boundary Conditions (Empty, Identical, Single Character Edits)", () => {
    assert.deepEqual(computeLcsDiff([], []), []);

    const diffAdd = computeLcsDiff([], ["a", "b", "c"]);
    assert.deepEqual(diffAdd, [
      { type: "add", text: "a" },
      { type: "add", text: "b" },
      { type: "add", text: "c" },
    ]);
    const diffDel = computeLcsDiff(["x", "y"], []);
    assert.deepEqual(diffDel, [
      { type: "del", text: "x" },
      { type: "del", text: "y" },
    ]);

    assert.deepEqual(computeLcsDiff(["hello"], ["hello"]), [
      { type: "same", text: "hello" },
    ]);

    assert.deepEqual(computeLcsDiff(["old"], ["new"]), [
      { type: "del", text: "old" },
      { type: "add", text: "new" },
    ]);

    const orig = ["b", "c", "d"];
    const insertStart = computeLcsDiff(orig, ["a", "b", "c", "d"]);
    assert.deepEqual(reconstructDiff(insertStart), {
      a: ["b", "c", "d"],
      b: ["a", "b", "c", "d"],
    });

    const insertMid = computeLcsDiff(orig, ["b", "c", "X", "d"]);
    assert.deepEqual(reconstructDiff(insertMid), {
      a: ["b", "c", "d"],
      b: ["b", "c", "X", "d"],
    });

    const insertEnd = computeLcsDiff(orig, ["b", "c", "d", "e"]);
    assert.deepEqual(reconstructDiff(insertEnd), {
      a: ["b", "c", "d"],
      b: ["b", "c", "d", "e"],
    });
  });

  test("Stress 2.2: Pathological Completely Disjoint Strings (5,000 tokens total)", () => {
    const t1 = [];
    const t2 = [];
    for (let i = 0; i < 2500; i++) {
      t1.push(`left_unique_${i}`);
      t2.push(`right_unique_${i}`);
    }

    const start = performance.now();
    const diff = computeLcsDiff(t1, t2);
    const elapsed = performance.now() - start;

    assert.ok(diff.length > 0, "Diff result must not be empty");
    const { a, b } = reconstructDiff(diff);
    assert.deepEqual(a, t1, "Reconstructed sequence A must match input t1");
    assert.deepEqual(b, t2, "Reconstructed sequence B must match input t2");

    const sameCount = diff.filter((d) => d.type === "same").length;
    assert.equal(sameCount, 0, "Completely disjoint inputs must have 0 same tokens");
    assert.ok(elapsed < 200, `5,000 token disjoint Myers diff completed in ${elapsed.toFixed(2)}ms (expected < 200ms)`);
  });

  test("Stress 2.3: Pathological Identical Long Strings (5,000 tokens)", () => {
    const tokens = [];
    for (let i = 0; i < 5000; i++) {
      tokens.push(`repeated_token_${i % 20}`);
    }

    const start = performance.now();
    const diff = computeLcsDiff(tokens, tokens);
    const elapsed = performance.now() - start;

    assert.equal(diff.length, 5000, "Identical inputs must yield exact same length");
    assert.ok(diff.every((d) => d.type === "same"), "All items must be of type 'same'");
    assert.ok(elapsed < 15, `5,000 token identical Myers diff took ${elapsed.toFixed(2)}ms (expected < 15ms)`);
  });

  test("Stress 2.4: Pathological Alternating / Periodic Sequences (A B A B... vs B A B A...)", () => {
    const t1 = [];
    const t2 = [];
    for (let i = 0; i < 1000; i++) {
      t1.push(i % 2 === 0 ? "A" : "B");
      t2.push(i % 2 === 0 ? "B" : "A");
    }

    const diff = computeLcsDiff(t1, t2);
    const { a, b } = reconstructDiff(diff);
    assert.deepEqual(a, t1, "Periodic sequence A must reconstruct identically");
    assert.deepEqual(b, t2, "Periodic sequence B must reconstruct identically");
  });

  test("Stress 2.5: 5,000+ Random Mutation Tokens (Substitutions, Deletions, Insertions)", () => {
    const vocabulary = [
      "const", "let", "var", "function", "async", "await", "return", "class",
      "import", "export", "from", "default", "if", "else", "switch", "case",
      "try", "catch", "finally", "throw", "new", "typeof", "instanceof",
      "console", "log", "error", "warn", "document", "window", "element"
    ];

    const t1 = [];
    const t2 = [];

    let seed = 42;
    function rand() {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    }

    for (let i = 0; i < 3000; i++) {
      const word = vocabulary[Math.floor(rand() * vocabulary.length)] + "_" + (i % 100);
      t1.push(word);

      const action = rand();
      if (action < 0.70) {
        t2.push(word);
      } else if (action < 0.85) {
        t2.push(word + "_mod");
      } else if (action < 0.92) {
        // deletion
      } else {
        t2.push(word);
        t2.push("injected_" + i);
      }
    }

    const totalTokens = t1.length + t2.length;
    assert.ok(totalTokens >= 5500, `Total tokens ${totalTokens} must be >= 5500`);

    const start = performance.now();
    const diff = computeLcsDiff(t1, t2);
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 50, `5,500+ random mutation diff completed in ${elapsed.toFixed(2)}ms (expected < 50ms)`);

    const { a, b } = reconstructDiff(diff);
    assert.deepEqual(a, t1, "Reconstructed A must match original t1");
    assert.deepEqual(b, t2, "Reconstructed B must match mutated t2");
  });

  test("Stress 2.6: Ultra-Long Input Tiered Degradation (12,000+ tokens > 10,000 limit) [CRITICAL DEFECT INVESTIGATION]", () => {
    const t1 = [];
    const t2 = [];

    for (let line = 0; line < 7000; line++) {
      const lineText = `Line ${line}: System event log with status code 200 and timestamp ${1600000000 + line}\n`;
      t1.push(lineText);
      if (line % 10 === 0) {
        t2.push(`Line ${line}: System event log with status code 500 [ERROR] and timestamp ${1600000000 + line}\n`);
      } else if (line % 15 !== 0) {
        t2.push(lineText);
      }
    }

    const totalTokens = t1.length + t2.length;
    assert.ok(totalTokens > 10000, `Total tokens ${totalTokens} must exceed 10,000 degradation threshold`);

    // Verify whether computeLcsDiff crashes due to missing vf/vb in computeLineLevelDiff
    let threwError = false;
    let errorMessage = "";
    try {
      computeLcsDiff(t1, t2);
    } catch (err) {
      threwError = true;
      errorMessage = err.message;
    }

    assert.equal(
      threwError,
      false,
      `CRITICAL DEFECT: computeLcsDiff on >10,000 tokens crashed with "${errorMessage}". computeLineLevelDiff in src/ui/dom.js:277 fails to allocate and pass vf, vb buffers to myersLinear.`
    );
  });

  test("Stress 2.7: Extreme Scale Input (25,000+ tokens) [CRITICAL DEFECT INVESTIGATION]", () => {
    const lines1 = [];
    const lines2 = [];
    for (let i = 0; i < 13000; i++) {
      lines1.push(`log_entry_${i}\n`);
      lines2.push(i % 5 === 0 ? `mod_log_entry_${i}\n` : `log_entry_${i}\n`);
    }

    let threwError = false;
    let errorMessage = "";
    try {
      computeLcsDiff(lines1, lines2);
    } catch (err) {
      threwError = true;
      errorMessage = err.message;
    }

    assert.equal(
      threwError,
      false,
      `CRITICAL DEFECT: 25,000+ tokens crashed with "${errorMessage}" in computeLineLevelDiff.`
    );
  });

  test("Stress 2.8: Unicode, Multibyte Emojis, CJK Punctuation & Mixed Whitespace", () => {
    const text1 = "你好，世界！这是一段用于测试 Myers Diff 的中文提示词。\n🚀 包含 Emoji 与混合符号 👨‍👩‍👧‍👦。\n\n保留换行与空格。";
    const text2 = "您好，世界！这是一段用于测试 Eugene Myers Diff 算法的中文提示词。\n🎉 包含 Emoji 与混合符号 👨‍👩‍👧‍👦！\n\n保留换行与制表符\t。";

    const doc = createStressDoc();
    const container = renderSimpleDiff(doc, text1, text2);

    assert.ok(container, "renderSimpleDiff must succeed with CJK & Emojis");
    assert.ok(container.children.length > 0, "Diff container must have child nodes");

    const allText = getNodeText(container);
    assert.ok(!allText.includes("[object Object]"), "Diff rendered text must not have [object Object]");
    assert.ok(allText.includes("世界"), "Rendered diff must preserve CJK characters");
    assert.ok(allText.includes("👨‍👩‍👧‍👦"), "Rendered diff must preserve multi-byte Emoji sequences");
  });

  test("Stress 2.9: DOM Fragment Merging Optimization (Zero Fragmentation)", () => {
    const doc = createStressDoc();
    const orig = "Hello world";
    const res = "Hello brave new wonderful world";

    const container = renderSimpleDiff(doc, orig, res);

    const insNodes = container.children.filter((c) => c.tagName === "INS");
    assert.equal(insNodes.length, 1, "Contiguous added tokens must be merged into exactly 1 <ins> tag");
    assert.equal(getNodeText(insNodes[0]), "brave new wonderful ", "Merged <ins> must contain full contiguous text");

    const delNodes = container.children.filter((c) => c.tagName === "DEL");
    assert.equal(delNodes.length, 0, "No deletion in pure insertion");
  });
});
