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
    if (name === "className") el.className = value;
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
    result.append(child.nodeType ? child : doc.createTextNode(String(child)));
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

function computeLcsDiff(tokens1, tokens2) {
  const m = tokens1.length;
  const n = tokens2.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (tokens1[i - 1] === tokens2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  const diff = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && tokens1[i - 1] === tokens2[j - 1]) {
      diff.unshift({ type: "same", text: tokens1[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({ type: "add", text: tokens2[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      diff.unshift({ type: "del", text: tokens1[i - 1] });
      i--;
    }
  }
  return diff;
}

export function renderSimpleDiff(doc, original, result) {
  const container = element(doc, "div", { className: "ctpo-diff-container" });
  const tokenize = (str) => String(str ?? "").split(/(\s+|[，。！？、；：""''（）\n\r]+|[.,!?;:()]+)/g).filter(Boolean);
  const t1 = tokenize(original);
  const t2 = tokenize(result);
  const diff = computeLcsDiff(t1.slice(0, 1000), t2.slice(0, 1000));
  for (const item of diff) {
    if (item.type === "same") {
      container.append(doc.createTextNode(item.text));
    } else if (item.type === "del") {
      container.append(element(doc, "del", { className: "ctpo-diff-del" }, [item.text]));
    } else if (item.type === "add") {
      container.append(element(doc, "ins", { className: "ctpo-diff-add" }, [item.text]));
    }
  }
  return container;
}
