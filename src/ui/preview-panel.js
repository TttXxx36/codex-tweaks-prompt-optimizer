import { ROOT_ATTRIBUTE, isSameComposerContext, replaceInputText, currentLocationHref } from "../renderer-core.js";
import { findPanelPosition, normalizePanelSize, PANEL_DEFAULT_WIDTH, PANEL_DEFAULT_HEIGHT } from "../panel-geometry.js";
import { actionButton, copyText, element, renderSimpleDiff, renderSimpleMarkdown, svgIcon } from "./dom.js";

export function createPanelLayout(layout = {}) {
  return {
    width: Number(layout.width) || PANEL_DEFAULT_WIDTH,
    height: Number(layout.height) || PANEL_DEFAULT_HEIGHT,
    left: Number.isFinite(layout.left) ? layout.left : null,
    top: Number.isFinite(layout.top) ? layout.top : null,
    manual: Boolean(layout.manual),
  };
}

export class PreviewPanelController {
  constructor({
    doc,
    uiRoot,
    viewportSize,
    node,
    onToast,
    onPersistAccepted,
    getCurrentComposer,
    documentHref,
  }) {
    this.doc = doc;
    this.uiRoot = uiRoot;
    this.viewportSize = viewportSize;
    this.node = node;
    this.onToast = onToast;
    this.onPersistAccepted = onPersistAccepted;
    this.getCurrentComposer = getCurrentComposer;
    this.documentHref = documentHref;

    this.panelHost = element(doc, "div", { [ROOT_ATTRIBUTE]: "", className: "ctpo-panel-host" });
    this.panelHost.style.inset = "0";
    this.panelHost.style.pointerEvents = "none";
    this.panelHost.style.position = "fixed";
    this.panelHost.style.zIndex = "2147483000";
    this.uiRoot.append(this.panelHost);

    this.panelState = null;
    this.dragCleanup = null;
    this.resizeObserver = null;
    this.disposed = false;
  }

  isOpen() {
    return Boolean(this.panelState);
  }

  getState() {
    return this.panelState;
  }

  show({
    original,
    result,
    clarifications = [],
    mode = "preview",
    context = null,
    fromHistory = false,
    layout = null,
    isStreaming = false,
    operationId = null,
    operationMethod = null,
  }) {
    const inheritedLayout = layout ?? this.panelState?.layout;
    this.panelState = {
      kind: "preview",
      original,
      result,
      clarifications,
      mode,
      context,
      fromHistory,
      isStreaming,
      operationId,
      operationMethod,
      viewTab: "edit",
      locationHref: this.documentHref(),
      layout: createPanelLayout(inheritedLayout ?? {}),
      notice: fromHistory ? "历史记录只会在你明确应用或复制时写入当前 Composer。" : "",
    };
    this.render();
  }

  showClarify({
    original,
    context = null,
    round = 1,
    operationId = null,
  }) {
    this.panelState = {
      kind: "clarify",
      original,
      context,
      locationHref: this.documentHref(),
      layout: createPanelLayout(this.panelState?.layout ?? {}),
      round,
      questions: [],
      answers: [],
      ready: false,
      busy: true,
      operationId,
      operationMethod: "clarify-round",
      notice: "",
    };
    this.render();
  }

  updateStreamChunk({ delta, accumulated, isDone }) {
    if (!this.panelState || this.panelState.kind !== "preview") return;
    this.panelState.result = accumulated;
    if (isDone) {
      this.panelState.isStreaming = false;
    }
    const resultTextarea = this.panelHost.querySelector("#ctpo-preview-result");
    if (resultTextarea && resultTextarea.value !== accumulated) {
      resultTextarea.value = accumulated;
    } else {
      this.render();
    }
  }

  close() {
    this.clearInteractions();
    this.panelHost.replaceChildren();
    this.panelState = null;
  }

  clearInteractions() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.dragCleanup?.();
    this.dragCleanup = null;
  }

  reflow() {
    const panel = this.panelHost.querySelector(".ctpo-panel");
    if (!panel || !this.panelState) return;
    this.applyGeometry(panel, this.panelState, { preservePosition: this.panelState.layout?.manual === true });
  }

  panelAnchorRect(panelState) {
    const element = panelState?.context?.element;
    return element?.isConnected ? element.getBoundingClientRect?.() : null;
  }

  applyGeometry(panel, panelState, { preservePosition = false } = {}) {
    if (!panel || !panelState) return;
    const layout = panelState.layout ?? createPanelLayout();
    const anchor = this.panelAnchorRect(panelState);
    const rect = panel.getBoundingClientRect?.();
    const size = normalizePanelSize(rect?.width || layout.width, rect?.height || layout.height, this.viewportSize());
    const preferred = preservePosition && Number.isFinite(layout.left) && Number.isFinite(layout.top)
      ? { left: layout.left, top: layout.top }
      : null;
    const position = findPanelPosition({
      anchor,
      width: size.width,
      height: size.height,
      viewport: this.viewportSize(),
      preferred,
    });
    panel.style.width = `${size.width}px`;
    panel.style.height = `${size.height}px`;
    panel.style.left = `${position.left}px`;
    panel.style.top = `${position.top}px`;
    panelState.layout = { ...layout, ...size, ...position };
  }

  installInteractions(panel, panelState) {
    const header = panel.querySelector(".ctpo-panel-header");
    const view = this.doc.defaultView;
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
        if (this.panelState !== panelState) return;
        const position = findPanelPosition({
          anchor: this.panelAnchorRect(panelState),
          width: Number(panelState.layout?.width) || PANEL_DEFAULT_WIDTH,
          height: Number(panelState.layout?.height) || PANEL_DEFAULT_HEIGHT,
          viewport: this.viewportSize(),
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
    this.dragCleanup = () => header.removeEventListener("pointerdown", onPointerDown);

    if (typeof ResizeObserver === "function") {
      this.resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry || this.panelState !== panelState) return;
        const width = Math.round(entry.contentRect?.width || panel.offsetWidth);
        const height = Math.round(entry.contentRect?.height || panel.offsetHeight);
        if (width > 0 && height > 0) {
          panelState.layout = { ...panelState.layout, width, height };
        }
      });
      this.resizeObserver.observe(panel);
    }
  }

  render() {
    this.clearInteractions();
    this.panelHost.replaceChildren();
    const panelState = this.panelState;
    if (!panelState || this.disposed) return;

    const panel = element(this.doc, "section", {
      className: "ctpo-panel",
      role: "dialog",
      "aria-modal": "false",
      "aria-labelledby": "ctpo-panel-title",
      "data-ctpo-panel": "true",
    });

    const close = element(this.doc, "button", {
      type: "button",
      className: "ctpo-panel-close",
      "aria-label": "关闭面板",
      "data-ctpo-tooltip": "关闭面板 (Esc)",
    }, [svgIcon(this.doc, "close")]);
    close.addEventListener("click", () => this.close());

    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.close();
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
      tabGroup = element(this.doc, "div", { className: "ctpo-tab-group" });
      const tabs = [
        { id: "edit", label: "编辑" },
        { id: "markdown", label: "Markdown" },
        { id: "diff", label: "对比 (Diff)" },
      ];
      for (const t of tabs) {
        const tabBtn = element(this.doc, "button", {
          type: "button",
          className: "ctpo-tab-btn",
          "data-active": (panelState.viewTab || "edit") === t.id ? "true" : "false",
        }, [t.label]);
        tabBtn.addEventListener("click", () => {
          panelState.viewTab = t.id;
          this.render();
        });
        tabGroup.append(tabBtn);
      }
    }

    const titleEl = element(this.doc, "h2", { id: "ctpo-panel-title" }, [
      panelState.kind === "clarify" ? "澄清提示词" : "优化结果",
      panelState.isStreaming ? element(this.doc, "span", { className: "ctpo-streaming-tag", style: "margin-left: 8px;" }, ["⚡ 生成中..."]) : null,
    ]);

    const header = element(this.doc, "div", {
      className: "ctpo-panel-header",
      "data-ctpo-drag-handle": "true",
      tabindex: "0",
      "aria-label": "拖动预览窗口",
    }, [
      titleEl,
      tabGroup || element(this.doc, "span"),
      close,
    ]);

    const content = element(this.doc, "div", { className: `ctpo-panel-content ctpo-panel-${panelState.kind}` });
    const actions = element(this.doc, "div", { className: "ctpo-actions ctpo-panel-actions" });
    panel.append(header, content, actions);

    if (panelState.kind === "preview") {
      this.renderPreviewContent(content, actions, panelState);
    } else {
      this.renderClarifyContent(content, actions, panelState);
    }

    this.panelHost.append(panel);
    this.applyGeometry(panel, panelState, { preservePosition: panelState.layout?.manual === true });
    this.installInteractions(panel, panelState);
    const firstInput = panel.querySelector("textarea, input, button");
    firstInput?.focus?.();
  }

  renderPreviewContent(panel, actions, panelState) {
    panel.append(element(this.doc, "p", { className: "ctpo-hint" }, [
      panelState.fromHistory
        ? "这是历史记录预览，不会自动覆盖当前 Composer。"
        : (panelState.isStreaming ? "正在实时生成优化提示词……" : "检查并编辑结果后，再决定是否应用 (快捷键 Ctrl+Enter 快速应用)。"),
    ]));

    panel.append(element(this.doc, "label", { className: "ctpo-label ctpo-panel-source-label" }, ["原始提示词"]));
    panel.append(element(this.doc, "div", { className: "ctpo-source" }, [panelState.original]));

    const resultLabel = element(this.doc, "label", { className: "ctpo-label ctpo-panel-result-label", for: "ctpo-preview-result" }, ["优化结果"]);
    panel.append(resultLabel);

    const viewTab = panelState.viewTab || "edit";
    if (viewTab === "markdown") {
      const md = renderSimpleMarkdown(this.doc, panelState.result);
      md.classList.add("ctpo-panel-result");
      panel.append(md);
    } else if (viewTab === "diff") {
      const diff = renderSimpleDiff(this.doc, panelState.original, panelState.result);
      diff.classList.add("ctpo-panel-result");
      panel.append(diff);
    } else {
      const result = element(this.doc, "textarea", { id: "ctpo-preview-result", className: "ctpo-panel-result", "aria-label": "可编辑的优化结果" }, [panelState.result]);
      result.addEventListener("input", () => { panelState.result = result.value; });
      panel.append(result);
    }

    const contextCurrent = panelState.context
      ? isSameComposerContext(panelState.context, panelState.context.element, currentLocationHref(panelState.context.element), panelState.original)
      : true;
    if (panelState.context && !contextCurrent) {
      panel.append(element(this.doc, "div", { className: "ctpo-status", role: "alert", "data-kind": "error" }, ["原 Composer 已变化。为避免覆盖新内容，应用按钮已停用。"]));
    }
    if (panelState.notice) {
      panel.append(element(this.doc, "div", { className: "ctpo-status" }, [panelState.notice]));
    }

    if (panelState.isStreaming) {
      const stopBtn = actionButton(this.doc, "停止生成", "stop-stream", { icon: "cancel", kind: "danger" });
      stopBtn.addEventListener("click", () => {
        if (panelState.operationId && panelState.operationMethod) {
          this.node?.invoke?.(panelState.operationMethod, { operationId: panelState.operationId, cancel: true }).catch?.(() => {});
        }
        panelState.isStreaming = false;
        this.render();
      });
      actions.append(stopBtn);
    }

    const apply = actionButton(this.doc, "应用结果", "apply-preview", { icon: "check", kind: "primary", disabled: Boolean(panelState.context && !contextCurrent) });
    apply.addEventListener("click", async () => {
      let target = panelState.context?.element;
      if (panelState.context) {
        if (!isSameComposerContext(panelState.context, target, currentLocationHref(target), panelState.original)) {
          this.render();
          return;
        }
      } else {
        target = this.getCurrentComposer?.();
        if (!target) {
          panelState.notice = "当前页面没有可用的 Composer。";
          this.render();
          return;
        }
      }
      replaceInputText(target, panelState.result);
      try {
        if (typeof this.onPersistAccepted === "function") {
          await this.onPersistAccepted({
            original: panelState.original,
            result: panelState.result,
            clarifications: panelState.clarifications,
            mode: panelState.mode,
          });
        }
        this.close();
        this.onToast?.("已应用优化结果。", "success");
      } catch (error) {
        panelState.notice = `结果已应用，但历史保存失败：${error.message}`;
        this.render();
      }
    });

    const copy = actionButton(this.doc, "复制结果", "copy-preview", { icon: "copy" });
    copy.addEventListener("click", async () => {
      try {
        await copyText(panelState.result);
        if (typeof this.onPersistAccepted === "function") {
          await this.onPersistAccepted({
            original: panelState.original,
            result: panelState.result,
            clarifications: panelState.clarifications,
            mode: panelState.mode,
          });
        }
        panelState.notice = "已复制，并已按明确接受动作保存历史。";
        this.render();
      } catch (error) {
        panelState.notice = error.message;
        this.render();
      }
    });

    actions.append(apply, copy, actionButton(this.doc, "取消", "cancel-preview", { icon: "cancel" }));
    actions.querySelector('[data-ctpo-action="cancel-preview"]').addEventListener("click", () => this.close());
  }

  renderClarifyContent(panel, actions, panelState) {
    panel.append(element(this.doc, "p", { className: "ctpo-hint" }, [`最多 3 轮，每轮最多 3 个问题。当前第 ${panelState.round} 轮；留空或跳过都可以。`]));
    panel.append(element(this.doc, "label", { className: "ctpo-label" }, ["原始提示词"]));
    panel.append(element(this.doc, "div", { className: "ctpo-source" }, [panelState.original]));
    if (panelState.notice) panel.append(element(this.doc, "div", { className: "ctpo-status", role: "alert", "data-kind": "error" }, [panelState.notice]));

    if (panelState.busy) {
      panel.append(element(this.doc, "div", { className: "ctpo-status" }, ["正在判断是否需要澄清……"]));
    } else if (panelState.questions.length) {
      const questions = element(this.doc, "div", { className: "ctpo-question-list" });
      panelState.questions.forEach((question, index) => {
        const input = element(this.doc, "textarea", { "data-ctpo-question-index": index, "aria-label": `澄清问题 ${index + 1}`, placeholder: "可留空或跳过" });
        questions.append(element(this.doc, "div", { className: "ctpo-question" }, [element(this.doc, "p", {}, [`${index + 1}. ${question}`]), input]));
      });
      panel.append(questions);
    } else if (panelState.ready) {
      panel.append(element(this.doc, "div", { className: "ctpo-status", "data-kind": "success" }, ["模型判断信息已足够。点击“生成预览”继续。"]));
    }

    if (!panelState.busy && panelState.questions.length) {
      const submitLabel = panelState.round >= 3 ? "提交回答并生成预览" : "提交回答";
      const submit = actionButton(this.doc, submitLabel, "submit-clarify", { icon: "check", kind: "primary" });
      submit.addEventListener("click", () => panelState.onSubmitClarify?.());
      actions.append(submit);
      const skip = actionButton(this.doc, "跳过并生成预览", "skip-clarify", { icon: "cancel" });
      skip.addEventListener("click", () => panelState.onSkipClarify?.());
      actions.append(skip);
    }
    if (!panelState.busy && (panelState.ready || panelState.round >= 3)) {
      const generate = actionButton(this.doc, "生成预览", "generate-clarify", { icon: "spark", kind: "primary" });
      generate.addEventListener("click", () => panelState.onSkipClarify?.());
      actions.append(generate);
    }
    const cancel = actionButton(this.doc, "取消", "cancel-clarify", { icon: "cancel" });
    cancel.addEventListener("click", () => this.close());
    actions.append(cancel);
  }

  dispose() {
    this.disposed = true;
    this.close();
    this.panelHost?.remove();
    this.panelHost = null;
  }
}
