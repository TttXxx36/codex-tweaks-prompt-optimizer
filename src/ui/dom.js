let instanceSequence = 0;

export function makeId(prefix = "ctpo") {
  instanceSequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${instanceSequence.toString(36)}`;
}

export function getDocument(root) {
  return root?.ownerDocument ?? (typeof document === "object" ? document : null);
}

export function setAttributes(el, attributes = {}) {
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === null) continue;
    if (name === "className") {
      el.className = value;
      if (typeof el.setAttribute === "function") el.setAttribute("class", String(value));
      if (typeof value === "string" && el.classList?.add) {
        for (const cls of value.split(/\s+/).filter(Boolean)) el.classList.add(cls);
      }
    }
    else if (name === "textContent") el.textContent = value;
    else if (name === "checked" || name === "disabled" || name === "readOnly" || name === "hidden") el[name] = Boolean(value);
    else if (name === "value") el.value = value;
    else el.setAttribute(name, String(value));
  }
  return el;
}

export function element(doc, tagName, attributes = {}, children = []) {
  const result = doc.createElement(tagName);
  setAttributes(result, attributes);
  for (const child of children) {
    if (child === null || child === undefined) continue;
    result.append(typeof child === "object" ? child : doc.createTextNode(String(child)));
  }
  return result;
}

export function svgIcon(doc, name) {
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

export function actionButton(doc, label, action, { kind = "default", icon, title, disabled = false } = {}) {
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

export function field(doc, labelText, control, hintText, hintId) {
  const label = element(doc, "label", { className: "ctpo-field" });
  const labelNode = element(doc, "span", { className: "ctpo-label" }, [labelText]);
  label.append(labelNode, control);
  if (hintText) label.append(element(doc, "span", { className: "ctpo-hint", id: hintId }, [hintText]));
  return label;
}

export async function copyText(text) {
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
