import "./style.css";
import {
  BUTTON_CLASS,
  RESTORE_BUTTON_CLASS,
  ROOT_ATTRIBUTE,
  captureComposerContext,
  currentLocationHref,
  findBestComposer,
  findComposerActionAnchor,
  findComposerCandidates,
  findComposerRegion,
  getComposerButtonPosition,
  isExcludedFromComposer,
  isSameComposerContext,
  findModelPicker,
  modelOptionValues,
  readInputText,
  replaceInputText,
} from "./renderer-core.js";
import {
  PANEL_DEFAULT_HEIGHT,
  PANEL_DEFAULT_WIDTH,
  PANEL_MARGIN,
  findPanelPosition,
  normalizePanelSize,
} from "./panel-geometry.js";

const RENDERER_DEFAULTS = {
  schemaVersion: 1,
  enabled: true,
  mode: "direct",
  protocol: "openaiResponses",
  baseUrl: "",
  apiKeyConfigured: false,
  model: "",
  instruction: "你是一名专业的提示词优化专家。请在不改变原始意图的前提下，将用户提供的提示词改写得更清晰、具体、可执行、可验证。\n\n要求：\n1. 保留原始提示词的语言、事实、URL、代码、数字、专有名词和明确的输出格式约束。\n2. 不要编造缺失事实；必要时使用清晰的占位符。\n3. 只输出可以直接使用的优化后提示词，不要添加解释、前言、后记或外层代码围栏。\n4. 不要读取或假设任何会话历史、文件、附件或项目上下文。",
  historyLimit: 10,
};

const MODE_OPTIONS = [
  ["direct", "直接替换"],
  ["preview", "预览后应用"],
  ["clarify", "多轮澄清"],
];

const PROTOCOL_OPTIONS = [
  ["openaiResponses", "OpenAI Responses"],
  ["openaiChatCompletions", "OpenAI Chat Completions"],
  ["anthropicMessages", "Anthropic Messages"],
];

const HISTORY_OPTIONS = [0, 5, 10, 20, 50];
let instanceSequence = 0;

function makeId(prefix = "ctpo") {
  instanceSequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${instanceSequence.toString(36)}`;
}

function getDocument(root) {
  return root?.ownerDocument ?? (typeof document === "object" ? document : null);
}

function setAttributes(element, attributes = {}) {
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === null) continue;
    if (name === "className") element.className = value;
    else if (name === "textContent") element.textContent = value;
    else if (name === "checked" || name === "disabled" || name === "readOnly" || name === "hidden") element[name] = Boolean(value);
    else if (name === "value") element.value = value;
    else element.setAttribute(name, String(value));
  }
  return element;
}

function element(doc, tagName, attributes = {}, children = []) {
  const result = doc.createElement(tagName);
  setAttributes(result, attributes);
  for (const child of children) {
    if (child === null || child === undefined) continue;
    result.append(child.nodeType ? child : doc.createTextNode(String(child)));
  }
  return result;
}

function svgIcon(doc, name) {
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
  };
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
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

function actionButton(doc, label, action, { kind = "default", icon, title, disabled = false } = {}) {
  const button = element(doc, "button", {
    type: "button",
    className: `ctpo-button ${kind === "primary" ? "ctpo-button-primary" : ""} ${kind === "danger" ? "ctpo-button-danger" : ""}`.trim(),
    "data-ctpo-action": action,
    title,
    disabled,
  });
  if (icon) button.append(svgIcon(doc, icon));
  button.append(doc.createTextNode(label));
  return button;
}

function createSettingsId(view, suffix) {
  return `ctpo-${view.id}-${suffix}`;
}

function isNodeResponseFailure(response) {
  return response?.status === "failed" || response?.status === "cancelled";
}

function errorFromNodeResponse(response) {
  const error = new Error(response?.message || (response?.status === "cancelled" ? "请求已取消" : "Node 请求失败"));
  error.code = response?.code || (response?.status === "cancelled" ? "cancelled" : "node_failed");
  return error;
}

function createPanelLayout(layout = {}) {
  const hasWidth = Number.isFinite(Number(layout.width));
  return {
    left: Number.isFinite(Number(layout.left)) ? Number(layout.left) : null,
    top: Number.isFinite(Number(layout.top)) ? Number(layout.top) : null,
    width: hasWidth ? Number(layout.width) : null,
    height: Number.isFinite(Number(layout.height)) ? Number(layout.height) : PANEL_DEFAULT_HEIGHT,
    manual: layout.manual === true,
    autoWidth: layout.autoWidth === true || (!hasWidth && layout.autoWidth !== false),
  };
}

export function activate({ root, onCleanup, api: _api, ui, node } = {}) {
  const doc = getDocument(root);
  if (!root || !doc) throw new Error("Renderer root 未提供");

  const state = {
    disposed: false,
    ready: false,
    settings: { ...RENDERER_DEFAULTS },
    history: [],
    settingsViews: new Set(),
    attached: new Map(),
    latestSnapshot: null,
    latestRestoreEntry: null,
    pendingResults: new Map(),
    activeOperations: new Map(),
    panel: null,
    panelHost: null,
    panelResizeObserver: null,
    panelDragCleanup: null,
    panelContextCleanup: null,
    composerMenu: null,
    settingsDialog: null,
    uiRoot: null,
    composerButtonHost: null,
    notice: { text: "", kind: "" },
    debugGeometry: false,
    debugGeometryReports: [],
    scanTimer: null,
    observer: null,
    toastTimer: null,
    cleanupRegistered: false,
  };

  root.setAttribute(ROOT_ATTRIBUTE, "");
  const overlayParent = doc.body ?? root;
  const uiRoot = element(doc, "div", { [ROOT_ATTRIBUTE]: "", className: "ctpo-ui-root" });
  const composerButtonHost = element(doc, "div", { [ROOT_ATTRIBUTE]: "", className: "ctpo-composer-button-host" });
  composerButtonHost.style.inset = "0";
  composerButtonHost.style.pointerEvents = "none";
  composerButtonHost.style.position = "fixed";
  composerButtonHost.style.zIndex = "2147482999";
  const panelHost = element(doc, "div", { [ROOT_ATTRIBUTE]: "", className: "ctpo-panel-host" });
  const settingsDialogHost = element(doc, "div", { [ROOT_ATTRIBUTE]: "", className: "ctpo-settings-dialog-host" });
  const toastHost = element(doc, "div", { [ROOT_ATTRIBUTE]: "", className: "ctpo-toast-host", "aria-live": "polite", "aria-atomic": "true" });
  uiRoot.append(composerButtonHost, panelHost, settingsDialogHost, toastHost);
  overlayParent.append(uiRoot);
  state.uiRoot = uiRoot;
  state.composerButtonHost = composerButtonHost;
  state.panelHost = panelHost;
  state.settingsDialogHost = settingsDialogHost;

  const setNotice = (text, kind = "") => {
    state.notice = { text, kind };
    for (const view of state.settingsViews) {
      if (view.status) {
        view.status.textContent = text;
        view.status.dataset.kind = kind;
      }
    }
  };

  const showToast = (text, kind = "") => {
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = null;
    toastHost.replaceChildren();
    if (!text) return;
    const toast = element(doc, "div", { className: `ctpo-toast ${kind ? `ctpo-toast-${kind}` : ""}`, role: kind === "error" ? "alert" : "status" }, [text]);
    toastHost.append(toast);
    state.toastTimer = setTimeout(() => {
      state.toastTimer = null;
      if (toast.parentElement === toastHost) toastHost.replaceChildren();
    }, 5_000);
  };

  const callNode = async (method, payload = {}) => {
    if (!node || typeof node.invoke !== "function") {
      const error = new Error("Node 权限尚未授权");
      error.code = "node_unavailable";
      throw error;
    }
    const response = await node.invoke(method, payload);
    if (isNodeResponseFailure(response)) throw errorFromNodeResponse(response);
    return response;
  };

  const refreshSettingsViews = () => {
    for (const view of state.settingsViews) view.render();
  };

  const refreshHistory = async () => {
    if (!node) return;
    try {
      const response = await callNode("list-history");
      state.history = Array.isArray(response.entries) ? response.entries : [];
      refreshSettingsViews();
    } catch (error) {
      setNotice(error.message, "error");
    }
  };

  const persistAccepted = async ({ original, result, clarifications = [], mode }) => {
    if (state.settings.historyLimit === 0) return;
    await callNode("save-settings", {
      historyRecord: {
        original,
        result,
        clarifications,
        mode,
        createdAt: new Date().toISOString(),
      },
    });
    await refreshHistory();
  };

  const closePanel = () => {
    const panel = state.panel;
    state.panel = null;
    clearPanelInteractions();
    if (panel?.operationId && panel.operationMethod) {
      node?.invoke?.(panel.operationMethod, { operationId: panel.operationId, cancel: true }).catch?.(() => {});
    }
    state.panelHost.replaceChildren();
  };

  const currentComposer = () => {
    const candidates = findComposerCandidates(doc);
    return candidates.find((candidate) => !candidate.closest?.(`[${ROOT_ATTRIBUTE}]`)) ?? null;
  };

  const documentHref = () => doc.defaultView?.location?.href ?? "";

  const panelAnchorElement = (panelState) => {
    const contextElement = panelState?.context?.element;
    if (contextElement?.isConnected !== false && contextElement?.getBoundingClientRect) return findComposerRegion(contextElement) ?? contextElement;
    const composer = currentComposer();
    return findComposerRegion(composer) ?? composer;
  };

  const panelAnchorRect = (panelState) => {
    const element = panelAnchorElement(panelState);
    if (!element) return null;
    const rect = element.getBoundingClientRect?.();
    if (!rect) return null;
    const left = Number(rect.left);
    const top = Number(rect.top);
    const right = Number.isFinite(Number(rect.right)) ? Number(rect.right) : left + Number(rect.width || 0);
    const bottom = Number.isFinite(Number(rect.bottom)) ? Number(rect.bottom) : top + Number(rect.height || 0);
    if (![left, top, right, bottom].every(Number.isFinite)) return null;
    return { left, top, right, bottom };
  };

  const viewportSize = () => ({
    width: Math.max(1, Number(doc.defaultView?.innerWidth || doc.documentElement?.clientWidth || PANEL_DEFAULT_WIDTH + PANEL_MARGIN * 2)),
    height: Math.max(1, Number(doc.defaultView?.innerHeight || doc.documentElement?.clientHeight || PANEL_DEFAULT_HEIGHT + PANEL_MARGIN * 2)),
  });

  const finiteNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  const geometryRect = (target) => {
    const rect = target?.getBoundingClientRect?.();
    if (!rect) return null;
    const left = finiteNumber(rect.left) ?? finiteNumber(rect.x);
    const top = finiteNumber(rect.top) ?? finiteNumber(rect.y);
    const width = finiteNumber(rect.width);
    const height = finiteNumber(rect.height);
    const right = finiteNumber(rect.right) ?? (left !== null && width !== null ? left + width : null);
    const bottom = finiteNumber(rect.bottom) ?? (top !== null && height !== null ? top + height : null);
    return { left, top, right, bottom, width, height, x: finiteNumber(rect.x) ?? left, y: finiteNumber(rect.y) ?? top };
  };

  const geometryIdentity = (target) => {
    if (!target) return null;
    const attribute = (name) => target.getAttribute?.(name) || "";
    return {
      tag: String(target.tagName || "").toLowerCase(),
      role: attribute("role"),
      id: String(target.id || ""),
      testId: attribute("data-testid"),
      ariaLabel: attribute("aria-label"),
      title: attribute("title"),
      connected: target.isConnected !== false,
    };
  };

  const transformZoom = (target) => {
    const style = target && doc.defaultView?.getComputedStyle?.(target);
    if (!style) return null;
    return {
      position: style.position || "",
      transform: style.transform || "",
      zoom: style.zoom || "",
      contain: style.contain || "",
      willChange: style.willChange || "",
    };
  };

  const visualViewportGeometry = () => {
    const visualViewport = doc.defaultView?.visualViewport;
    return {
      width: finiteNumber(visualViewport?.width),
      height: finiteNumber(visualViewport?.height),
      offsetLeft: finiteNumber(visualViewport?.offsetLeft),
      offsetTop: finiteNumber(visualViewport?.offsetTop),
      scale: finiteNumber(visualViewport?.scale),
      devicePixelRatio: finiteNumber(doc.defaultView?.devicePixelRatio),
    };
  };

  const refreshDebugOutputViews = () => {
    const serialized = JSON.stringify(state.debugGeometryReports, null, 2);
    for (const view of state.settingsViews) {
      if (view.debugOutput) view.debugOutput.value = serialized;
    }
  };

  const recordGeometry = (entry, phase, previousAnchor) => {
    if (!state.debugGeometry || !entry) return;
    const composerRegion = findComposerRegion(entry.element);
    const modelPicker = findModelPicker(entry.element);
    const oldAnchor = previousAnchor === undefined ? entry.anchor : previousAnchor;
    state.debugGeometryReports.push({
      schema: "ctpo-geometry-v1",
      at: new Date().toISOString(),
      phase,
      composerRect: geometryRect(composerRegion),
      composerInputRect: geometryRect(entry.element),
      previousAnchorRect: geometryRect(oldAnchor),
      previousAnchor: geometryIdentity(oldAnchor),
      anchorRect: geometryRect(entry.anchor),
      anchor: geometryIdentity(entry.anchor),
      modelPickerRect: geometryRect(modelPicker),
      modelPicker: geometryIdentity(modelPicker),
      buttonRect: geometryRect(entry.button),
      menuButtonRect: geometryRect(entry.menuButton),
      buttonHostRect: geometryRect(composerButtonHost),
      viewport: {
        ...viewportSize(),
        scrollX: finiteNumber(doc.defaultView?.scrollX),
        scrollY: finiteNumber(doc.defaultView?.scrollY),
        clientWidth: finiteNumber(doc.documentElement?.clientWidth),
        clientHeight: finiteNumber(doc.documentElement?.clientHeight),
      },
      visualViewport: visualViewportGeometry(),
      transformZoom: {
        composer: transformZoom(composerRegion),
        previousAnchor: transformZoom(oldAnchor),
        anchor: transformZoom(entry.anchor),
        modelPicker: transformZoom(modelPicker),
        button: transformZoom(entry.button),
        buttonHost: transformZoom(composerButtonHost),
      },
    });
    if (state.debugGeometryReports.length > 60) state.debugGeometryReports.shift();
    refreshDebugOutputViews();
  };

  const panelSessionIsCurrent = (panelState) => {
    if (!panelState) return false;
    if (panelState.locationHref && panelState.locationHref !== documentHref()) return false;
    const context = panelState.context;
    return !context || isSameComposerContext(context, context.element, currentLocationHref(context.element));
  };

  const readPanelSize = (panel, layout, anchor) => {
    const rect = panel.getBoundingClientRect?.();
    const anchorWidth = anchor ? anchor.right - anchor.left : 0;
    return normalizePanelSize(
      layout.autoWidth && anchorWidth > 0 ? anchorWidth : (rect?.width || layout.width),
      rect?.height || layout.height,
      viewportSize(),
    );
  };

  const applyPanelGeometry = (panel, panelState, { preservePosition = false } = {}) => {
    if (!panel || !panelState) return;
    const layout = panelState.layout ?? createPanelLayout();
    const anchor = panelAnchorRect(panelState);
    const size = readPanelSize(panel, layout, anchor);
    const preferred = preservePosition && Number.isFinite(layout.left) && Number.isFinite(layout.top)
      ? { left: layout.left, top: layout.top }
      : null;
    const position = findPanelPosition({
      anchor,
      width: size.width,
      height: size.height,
      viewport: viewportSize(),
      preferred,
    });
    panel.style.width = `${size.width}px`;
    panel.style.height = `${size.height}px`;
    panel.style.left = `${position.left}px`;
    panel.style.top = `${position.top}px`;
    panelState.layout = { ...layout, ...size, ...position };
  };

  const clearPanelInteractions = () => {
    state.panelResizeObserver?.disconnect?.();
    state.panelResizeObserver = null;
    state.panelDragCleanup?.();
    state.panelDragCleanup = null;
    state.panelContextCleanup?.();
    state.panelContextCleanup = null;
  };

  const installPanelInteractions = (panel, panelState) => {
    const header = panel.querySelector?.(".ctpo-panel-header");
    const view = doc.defaultView;
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
        if (state.panel !== panelState) return;
        const position = findPanelPosition({
          anchor: panelAnchorRect(panelState),
          width: startRect.width,
          height: startRect.height,
          viewport: viewportSize(),
          preferred: {
            left: startRect.left + moveEvent.clientX - startX,
            top: startRect.top + moveEvent.clientY - startY,
          },
        });
        panel.style.left = `${position.left}px`;
        panel.style.top = `${position.top}px`;
        panelState.layout = { ...panelState.layout, ...position, width: startRect.width, height: startRect.height };
      };
      const stopDragging = () => {
        header.dataset.dragging = "false";
        view.removeEventListener("pointermove", onPointerMove, true);
        view.removeEventListener("pointerup", stopDragging, true);
        view.removeEventListener("pointercancel", stopDragging, true);
        if (state.panelDragCleanup === stopDragging) state.panelDragCleanup = null;
      };
      state.panelDragCleanup?.();
      state.panelDragCleanup = stopDragging;
      view.addEventListener("pointermove", onPointerMove, true);
      view.addEventListener("pointerup", stopDragging, true);
      view.addEventListener("pointercancel", stopDragging, true);
    };
    header.addEventListener("pointerdown", onPointerDown);

    const contextElement = panelState.context?.element;
    if (contextElement?.addEventListener) {
      const syncApplyState = () => {
        if (state.panel !== panelState) return;
        const apply = panel.querySelector?.('[data-ctpo-action="apply-preview"]');
        if (!apply) return;
        const current = isSameComposerContext(panelState.context, contextElement, currentLocationHref(contextElement), panelState.original);
        apply.disabled = !current;
        apply.title = current ? "应用优化结果" : "原 Composer 已变化，请重新优化";
      };
      contextElement.addEventListener("input", syncApplyState);
      state.panelContextCleanup = () => contextElement.removeEventListener("input", syncApplyState);
      syncApplyState();
    }

    const ResizeObserverCtor = view.ResizeObserver ?? globalThis.ResizeObserver;
    if (typeof ResizeObserverCtor === "function") {
      state.panelResizeObserver = new ResizeObserverCtor(() => {
        if (state.panel !== panelState) return;
        const rect = panel.getBoundingClientRect?.();
        const previousWidth = Number(panelState.layout?.width);
        if (Number.isFinite(rect?.width) && Number.isFinite(previousWidth) && Math.abs(rect.width - previousWidth) > 0.5) {
          panelState.layout = { ...panelState.layout, autoWidth: false };
        }
        applyPanelGeometry(panel, panelState, { preservePosition: true });
      });
      state.panelResizeObserver.observe(panel);
    }
  };

  function reflowPanel() {
    const panelState = state.panel;
    const panel = state.panelHost?.querySelector?.(".ctpo-panel");
    if (!panelState || !panel || state.disposed) return;
    if (!panelSessionIsCurrent(panelState)) {
      closePanel();
      return;
    }
    applyPanelGeometry(panel, panelState, { preservePosition: panelState.layout?.manual === true });
  }

  const updateButton = (entry, busy) => {
    if (!entry?.button) return;
    entry.busy = busy;
    entry.button.dataset.busy = busy ? "true" : "false";
    entry.button.setAttribute("aria-busy", busy ? "true" : "false");
    entry.button.replaceChildren(svgIcon(doc, busy ? "cancel" : "spark"), doc.createTextNode(busy ? "取消" : "优化"));
    entry.button.title = busy ? "取消当前优化请求" : "优化当前提示词";
  };

  const closeComposerMenu = () => {
    state.composerMenu?.entry?.menuButton?.setAttribute("aria-expanded", "false");
    state.composerMenu?.element?.remove();
    state.composerMenu = null;
  };

  const openComposerMenu = (entry) => {
    if (!entry?.button || !state.composerButtonHost) return;
    if (state.composerMenu?.entry === entry) {
      closeComposerMenu();
      return;
    }
    closeComposerMenu();
    const menu = element(doc, "div", {
      className: "ctpo-composer-menu",
      role: "menu",
      "aria-label": "提示词优化菜单",
    });
    const settings = element(doc, "button", { type: "button", role: "menuitem" }, ["提示词优化设置"]);
    settings.addEventListener("click", () => openSettings());
    const history = element(doc, "button", { type: "button", role: "menuitem" }, ["优化历史"]);
    history.addEventListener("click", () => openSettings({ focusHistory: true }));
    menu.append(settings, history);
    state.composerButtonHost.append(menu);
    const triggerRect = entry.button.getBoundingClientRect?.();
    const menuRect = menu.getBoundingClientRect?.();
    const viewport = viewportSize();
    const width = Number(menuRect?.width) || 176;
    const height = Number(menuRect?.height) || 72;
    const left = Math.max(8, Math.min((Number(triggerRect?.right) || 8) - width, viewport.width - width - 8));
    const top = Math.max(8, Math.min((Number(triggerRect?.bottom) || 8) + 4, viewport.height - height - 8));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    state.composerMenu = { entry, element: menu };
    entry.menuButton?.setAttribute("aria-expanded", "true");
    settings.focus?.();
  };

  const ensureRestoreButton = (entry, snapshot) => {
    if (!entry?.button || !state.composerButtonHost || !snapshot) return;
    if (state.latestRestoreEntry && state.latestRestoreEntry !== entry) {
      state.latestRestoreEntry.restoreButton?.remove();
      state.latestRestoreEntry.restoreButton = null;
    }
    state.latestSnapshot = snapshot;
    state.latestRestoreEntry = entry;
    if (!entry.restoreButton) {
      const restore = actionButton(doc, "恢复原文", "restore", { icon: "refresh", title: "恢复本次优化前的原文" });
      restore.classList.add(RESTORE_BUTTON_CLASS);
      restore.addEventListener("click", () => {
        if (!isSameComposerContext(snapshot.context, entry.element, currentLocationHref(entry.element), snapshot.result)) {
          showToast("当前 Composer 已变化，未恢复旧原文。", "error");
          return;
        }
        replaceInputText(entry.element, snapshot.original);
        entry.restoreButton?.remove();
        entry.restoreButton = null;
        if (state.latestSnapshot === snapshot) state.latestSnapshot = null;
        if (state.latestRestoreEntry === entry) state.latestRestoreEntry = null;
        showToast("已恢复本次优化前的原文", "success");
      });
      restore.hidden = true;
      restore.style.pointerEvents = "auto";
      restore.style.position = "fixed";
      restore.style.zIndex = "2147482999";
      state.composerButtonHost.append(restore);
      entry.restoreButton = restore;
      positionComposerButton(entry);
    }
  };

  const showPreview = ({ original, result, clarifications = [], mode = "preview", context = null, fromHistory = false, layout = null }) => {
    const inheritedLayout = layout ?? state.panel?.layout;
    state.panel = {
      kind: "preview",
      original,
      result,
      clarifications,
      mode,
      context,
      fromHistory,
      locationHref: documentHref(),
      layout: createPanelLayout(inheritedLayout ?? {}),
      notice: fromHistory ? "历史记录只会在你明确应用或复制时写入当前 Composer。" : "",
    };
    renderPanel();
  };

  const recordPending = (context, result) => {
    state.pendingResults.set(context.key, { context, result });
    if (state.pendingResults.size > 20) state.pendingResults.delete(state.pendingResults.keys().next().value);
    showToast("原 Composer 已变化，结果未自动写入。请回到原上下文后重新操作。", "error");
  };

  const startOptimization = async (entry) => {
    if (!entry || state.disposed) return;
    closeComposerMenu();
    closeSettingsDialog();
    if (entry.busy) {
      const operation = entry.operation;
      const panelOperation = state.panel?.context?.element === entry.element && state.panel.operationId
        ? { method: state.panel.operationMethod, id: state.panel.operationId }
        : operation;
      if (panelOperation) node?.invoke?.(panelOperation.method, { operationId: panelOperation.id, cancel: true }).catch?.(() => {});
      return;
    }
    const original = readInputText(entry.element);
    if (!original.trim()) {
      showToast("当前 Composer 为空。", "error");
      return;
    }
    closePanel();
    const context = captureComposerContext(entry.element, currentLocationHref(entry.element));
    const operation = { id: makeId("optimize"), method: "optimize", context };
    entry.operation = operation;
    state.activeOperations.set(operation.id, operation);
    updateButton(entry, true);
    try {
      if (state.settings.mode === "clarify") {
        state.panel = {
          kind: "clarify",
          original,
          context,
          locationHref: documentHref(),
          layout: createPanelLayout(),
          answers: [],
          questions: [],
          round: 1,
          ready: false,
          busy: true,
          operationId: null,
          operationMethod: null,
          notice: "",
        };
        renderPanel();
        await runClarifyRound(state.panel);
        return;
      }
      const response = await callNode("optimize", { operationId: operation.id, text: original });
      const result = String(response.result ?? "").trim();
      if (!isSameComposerContext(context, entry.element, currentLocationHref(entry.element), original)) {
        recordPending(context, result);
        return;
      }
      if (state.settings.mode === "direct") {
        replaceInputText(entry.element, result);
        const snapshot = { context, original, result, createdAt: new Date().toISOString() };
        ensureRestoreButton(entry, snapshot);
        try {
          await persistAccepted({ original, result, mode: "direct" });
          showToast("提示词已优化并替换；可用“恢复原文”撤销本次写回。", "success");
        } catch (error) {
          showToast(`提示词已写回，但历史保存失败：${error.message}`, "error");
        }
      } else {
        showPreview({ original, result, mode: "preview", context });
      }
    } catch (error) {
      if (error.code !== "cancelled") showToast(error.message, "error");
    } finally {
      state.activeOperations.delete(operation.id);
      if (entry.operation?.id === operation.id) {
        entry.operation = null;
        updateButton(entry, false);
      }
    }
  };

  const positionComposerButton = (entry, options = {}) => {
    const previousAnchor = Object.prototype.hasOwnProperty.call(options, "previousAnchor") ? options.previousAnchor : entry.anchor;
    const phase = options.phase || "position";
    const anchorRect = entry.anchor?.getBoundingClientRect?.();
    if (!anchorRect || !state.composerButtonHost) {
      entry.button.hidden = true;
      if (entry.menuButton) entry.menuButton.hidden = true;
      if (entry.restoreButton) entry.restoreButton.hidden = true;
      recordGeometry(entry, `${phase}:hidden-no-anchor`, previousAnchor);
      return false;
    }
    entry.button.style.pointerEvents = "auto";
    entry.button.style.position = "fixed";
    entry.button.style.zIndex = "2147482999";
    entry.button.hidden = false;
    if (entry.menuButton) {
      entry.menuButton.style.pointerEvents = "auto";
      entry.menuButton.style.position = "fixed";
      entry.menuButton.style.zIndex = "2147482999";
      entry.menuButton.hidden = false;
    }
    const buttonRect = entry.button.getBoundingClientRect?.() ?? {};
    const menuRect = entry.menuButton?.getBoundingClientRect?.() ?? {};
    const buttonWidth = Number(buttonRect.width) || 0;
    const menuWidth = Number(menuRect.width) || 0;
    const groupWidth = buttonWidth + (menuWidth > 0 ? menuWidth + 2 : 0);
    const position = getComposerButtonPosition(anchorRect, {
      width: groupWidth,
      height: Math.max(Number(buttonRect.height) || 0, Number(menuRect.height) || 0),
    }, viewportSize());
    if (!position) {
      entry.button.hidden = true;
      if (entry.menuButton) entry.menuButton.hidden = true;
      if (entry.restoreButton) entry.restoreButton.hidden = true;
      recordGeometry(entry, `${phase}:hidden-invalid-position`, previousAnchor);
      return false;
    }
    entry.button.style.left = `${position.left}px`;
    entry.button.style.top = `${position.top}px`;
    if (entry.menuButton) {
      entry.menuButton.hidden = false;
      entry.menuButton.style.left = `${position.left + buttonWidth + 2}px`;
      entry.menuButton.style.top = `${position.top}px`;
    }
    if (entry.restoreButton) {
      entry.restoreButton.hidden = false;
      entry.restoreButton.style.left = `${position.left + groupWidth + 4}px`;
      entry.restoreButton.style.top = `${position.top}px`;
    }
    recordGeometry(entry, phase, previousAnchor);
    return true;
  };

  const placeComposerButton = (entry, anchor, options = {}) => {
    if (!anchor?.parentElement || !state.composerButtonHost) return false;
    if (entry.button.parentElement !== state.composerButtonHost) state.composerButtonHost.append(entry.button);
    if (entry.menuButton?.parentElement !== state.composerButtonHost) state.composerButtonHost.append(entry.menuButton);
    if (entry.restoreButton && entry.restoreButton.parentElement !== state.composerButtonHost) state.composerButtonHost.append(entry.restoreButton);
    entry.anchor = anchor;
    return positionComposerButton(entry, options);
  };

  const attachComposer = (composer) => {
    if (state.attached.has(composer) || composer.closest?.(`[${ROOT_ATTRIBUTE}]`)) return;
    const anchor = findComposerActionAnchor(composer);
    if (!anchor?.parentElement) return;
    const button = element(doc, "button", {
      type: "button",
      className: BUTTON_CLASS,
      "aria-label": "优化当前提示词",
      title: "优化当前提示词",
      "data-codex-tweaks-prompt-optimizer": "button",
      hidden: true,
    }, [svgIcon(doc, "spark"), "优化"]);
    const menuButton = element(doc, "button", {
      type: "button",
      className: "ct-prompt-optimizer-menu-button",
      "aria-label": "打开提示词优化菜单",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      title: "提示词优化菜单",
      hidden: true,
    }, [svgIcon(doc, "chevron")]);
    const entry = { element: composer, anchor, button, menuButton, restoreButton: null, operation: null, busy: false };
    entry.debugPasteListener = () => {
      recordGeometry(entry, "paste-event", entry.anchor);
      scheduleScan();
    };
    entry.debugInputListener = () => {
      recordGeometry(entry, "input-event", entry.anchor);
      scheduleScan();
    };
    composer.addEventListener?.("paste", entry.debugPasteListener);
    composer.addEventListener?.("input", entry.debugInputListener);
    button.addEventListener("click", () => startOptimization(entry));
    menuButton.addEventListener("click", () => openComposerMenu(entry));
    placeComposerButton(entry, anchor, { previousAnchor: null, phase: "attach" });
    state.attached.set(composer, entry);
  };

  const detachComposer = (entry) => {
    if (state.composerMenu?.entry === entry) closeComposerMenu();
    entry.element?.removeEventListener?.("paste", entry.debugPasteListener);
    entry.element?.removeEventListener?.("input", entry.debugInputListener);
    entry.button?.remove();
    entry.menuButton?.remove();
    entry.restoreButton?.remove();
    state.attached.delete(entry.element);
  };

  const scanComposers = () => {
    state.scanTimer = null;
    if (state.disposed || !state.ready || !state.settings.enabled || !node) {
      closePanel();
      for (const entry of state.attached.values()) detachComposer(entry);
      return;
    }
    if (state.panel && !panelSessionIsCurrent(state.panel)) closePanel();
    for (const entry of [...state.attached.values()]) {
      if (!entry.element.isConnected || !entry.button.isConnected) detachComposer(entry);
      else {
        const previousAnchor = entry.anchor;
        const nextAnchor = findComposerActionAnchor(entry.element, entry.anchor);
        if (nextAnchor && nextAnchor !== entry.anchor) placeComposerButton(entry, nextAnchor, { previousAnchor, phase: "scan-anchor-change" });
        else if (nextAnchor) positionComposerButton(entry, { previousAnchor, phase: "scan" });
        else {
          entry.button.hidden = true;
          if (entry.menuButton) entry.menuButton.hidden = true;
          if (entry.restoreButton) entry.restoreButton.hidden = true;
          recordGeometry(entry, "scan:no-anchor", previousAnchor);
        }
      }
    }
    for (const composer of findComposerCandidates(doc)) attachComposer(composer);
  };

  const scheduleScan = () => {
    if (state.scanTimer || state.disposed) return;
    state.scanTimer = setTimeout(scanComposers, 120);
  };

  const setDebugGeometry = (enabled) => {
    state.debugGeometry = Boolean(enabled);
    refreshDebugOutputViews();
    if (state.debugGeometry) {
      setNotice("临时定位诊断已开启，仅记录几何和控件标识，不记录输入内容。", "success");
      scheduleScan();
    } else {
      setNotice("临时定位诊断已关闭；现有诊断记录仍保留在本次会话中。");
    }
  };

  const reflowComposerButtons = (event) => {
    if (state.disposed) return;
    const scroller = event?.target;
    const isGlobalScroll = !scroller
      || scroller === doc
      || scroller === doc.defaultView
      || scroller === doc.documentElement
      || scroller === doc.body;
    for (const entry of state.attached.values()) {
      if (!isGlobalScroll && (isExcludedFromComposer(scroller) || !scroller.contains?.(entry.anchor))) continue;
      const previousAnchor = entry.anchor;
      const nextAnchor = findComposerActionAnchor(entry.element, entry.anchor);
      if (!nextAnchor) {
        entry.button.hidden = true;
        if (entry.menuButton) entry.menuButton.hidden = true;
        if (entry.restoreButton) entry.restoreButton.hidden = true;
        recordGeometry(entry, "reflow:no-anchor", previousAnchor);
      } else if (nextAnchor !== entry.anchor) {
        placeComposerButton(entry, nextAnchor, { previousAnchor, phase: "reflow-anchor-change" });
      } else {
        positionComposerButton(entry, { previousAnchor, phase: "reflow" });
      }
    }
  };

  const renderHistory = (view, list) => {
    list.replaceChildren();
    if (!state.history.length) {
      list.append(element(doc, "li", { className: "ctpo-hint" }, [state.settings.historyLimit === 0 ? "历史保留设置为 0。" : "暂无历史记录。"]));
      return;
    }
    for (const entry of state.history) {
      const preview = element(doc, "div", { className: "ctpo-history-copy" }, [
        element(doc, "div", { className: "ctpo-history-preview" }, [entry.original]),
        element(doc, "div", { className: "ctpo-history-date" }, [new Date(entry.createdAt).toLocaleString()]),
      ]);
      const actions = element(doc, "div", { className: "ctpo-actions" }, [
        actionButton(doc, "预览", "history-preview", { icon: "eye" }),
        actionButton(doc, "删除", "history-delete", { icon: "trash", kind: "danger" }),
      ]);
      actions.querySelector('[data-ctpo-action="history-preview"]').addEventListener("click", () => showPreview({
        original: entry.original,
        result: entry.result,
        clarifications: entry.clarifications,
        mode: entry.mode,
        context: null,
        fromHistory: true,
      }));
      actions.querySelector('[data-ctpo-action="history-delete"]').addEventListener("click", async () => {
        if (doc.defaultView?.confirm && !doc.defaultView.confirm("删除这条优化历史？")) return;
        try {
          await callNode("delete-history", { id: entry.id });
          state.history = state.history.filter((item) => item.id !== entry.id);
          view.render();
        } catch (error) {
          setNotice(error.message, "error");
        }
      });
      list.append(element(doc, "li", { className: "ctpo-history-item" }, [preview, actions]));
    }
  };

  const buildSettingsView = (container, { embedded = false } = {}) => {
    const view = {
      id: makeId("settings"),
      container,
      status: null,
      saveFeedback: null,
      inlineNotice: { text: "", kind: "" },
      modelOptions: [],
      keyDraft: "",
      keyVisible: false,
      busy: false,
      debugOutput: null,
      render: null,
    };
    const setInlineNotice = (text, kind = "") => {
      view.inlineNotice = { text, kind };
      if (view.saveFeedback) {
        view.saveFeedback.textContent = text;
        view.saveFeedback.dataset.kind = kind;
      }
      if (state.notice.text) setNotice("");
    };
    container.setAttribute(ROOT_ATTRIBUTE, "");
    view.render = () => {
      if (state.disposed) return;
      const settings = state.settings;
      container.replaceChildren();
      const wrapper = element(doc, "main", { className: "ctpo-settings" });
      const header = element(doc, "header", { className: "ctpo-pane-header" }, [
        element(doc, "h1", { className: "ctpo-title" }, ["提示词优化"]),
        element(doc, "p", { className: "ctpo-description" }, ["只处理当前 Composer 中的提示词，并通过你指定的 API 生成可直接使用的优化结果。不会读取会话历史、文件、附件或项目上下文。"]),
      ]);
      if (!embedded) wrapper.append(header);

      const generalCard = element(doc, "section", { className: "ctpo-card", "aria-labelledby": `${view.id}-general` });
      generalCard.append(element(doc, "h2", { id: `${view.id}-general` }, ["基本设置"]));
      const switchLabel = element(doc, "label", { className: "ctpo-switch-row" });
      const switchCopy = element(doc, "span", {}, [
        element(doc, "span", { className: "ctpo-label" }, ["启用优化按钮"]),
        element(doc, "span", { className: "ctpo-hint" }, ["包启用后，控制 Composer 附近的入口。首次启用默认开启。"]),
      ]);
      const enabled = element(doc, "input", { type: "checkbox", className: "ctpo-switch", role: "switch", "aria-label": "启用优化按钮", checked: settings.enabled });
      enabled.addEventListener("change", () => {
        state.settings.enabled = enabled.checked;
        scheduleScan();
      });
      switchLabel.append(switchCopy, enabled);
      generalCard.append(switchLabel);

      const debugCard = element(doc, "section", {
        className: "ctpo-card",
        "aria-labelledby": `${view.id}-debug-geometry`,
        "data-ctpo-settings-section": "debug-geometry",
      });
      debugCard.append(
        element(doc, "h2", { id: `${view.id}-debug-geometry` }, ["临时定位诊断"]),
        element(doc, "p", { className: "ctpo-hint" }, ["仅在本次会话记录 Composer、锚点、按钮和视口几何；不记录输入内容、API Key、地址或请求数据。"]),
      );
      const debugSwitchLabel = element(doc, "label", { className: "ctpo-switch-row" });
      const debugSwitchCopy = element(doc, "span", {}, [
        element(doc, "span", { className: "ctpo-label" }, ["启用临时定位诊断"]),
        element(doc, "span", { className: "ctpo-hint" }, ["打开后请粘贴一次，再导出下方 JSON。关闭或停用包后记录不会写入磁盘。"]),
      ]);
      const debugSwitch = element(doc, "input", {
        type: "checkbox",
        className: "ctpo-switch",
        role: "switch",
        "aria-label": "启用临时定位诊断",
        checked: state.debugGeometry,
      });
      debugSwitch.addEventListener("change", () => setDebugGeometry(debugSwitch.checked));
      debugSwitchLabel.append(debugSwitchCopy, debugSwitch);
      const debugOutput = element(doc, "textarea", {
        className: "ctpo-debug-output",
        "aria-label": "定位诊断输出",
        readOnly: true,
        spellcheck: "false",
        wrap: "off",
      });
      debugOutput.value = JSON.stringify(state.debugGeometryReports, null, 2);
      view.debugOutput = debugOutput;
      const debugActions = element(doc, "div", { className: "ctpo-actions" });
      const selectDebug = actionButton(doc, "选择诊断文本（Ctrl+C 复制）", "select-debug-geometry", { icon: "copy", title: "选择不含输入内容的几何诊断 JSON" });
      selectDebug.addEventListener("click", () => {
        debugOutput.focus?.();
        debugOutput.select?.();
        setInlineNotice("诊断 JSON 已选中，请按 Ctrl+C 复制；内容不含输入文本。", "success");
      });
      const clearDebug = actionButton(doc, "清空诊断", "clear-debug-geometry", { icon: "trash", kind: "danger", title: "清空本次会话的定位诊断记录" });
      clearDebug.addEventListener("click", () => {
        state.debugGeometryReports.length = 0;
        refreshDebugOutputViews();
        setInlineNotice("定位诊断记录已清空。", "success");
      });
      debugActions.append(selectDebug, clearDebug);
      debugCard.append(debugSwitchLabel, debugActions, debugOutput);
      wrapper.append(generalCard, debugCard);

      const providerCard = element(doc, "section", { className: "ctpo-card", "aria-labelledby": `${view.id}-provider` });
      providerCard.append(element(doc, "h2", { id: `${view.id}-provider` }, ["Provider 配置"]));
      const grid = element(doc, "div", { className: "ctpo-grid" });
      const modeSelect = element(doc, "select", { id: createSettingsId(view, "mode"), "aria-describedby": createSettingsId(view, "mode-hint") });
      for (const [value, label] of MODE_OPTIONS) modeSelect.append(element(doc, "option", { value, textContent: label }));
      modeSelect.value = settings.mode;
      modeSelect.addEventListener("change", () => { state.settings.mode = modeSelect.value; });
      grid.append(field(doc, "运行模式", modeSelect, "每次请求都只使用当前 Composer 内容。", createSettingsId(view, "mode-hint")));

      const protocolSelect = element(doc, "select", { id: createSettingsId(view, "protocol") });
      for (const [value, label] of PROTOCOL_OPTIONS) protocolSelect.append(element(doc, "option", { value, textContent: label }));
      protocolSelect.value = settings.protocol;
      protocolSelect.addEventListener("change", () => { state.settings.protocol = protocolSelect.value; });
      grid.append(field(doc, "API 协议", protocolSelect, "首版使用完整响应，不使用流式输出。"));

      const baseUrl = element(doc, "input", { id: createSettingsId(view, "base-url"), type: "url", autocomplete: "url", placeholder: "https://api.example.com/v1" });
      baseUrl.value = settings.baseUrl;
      baseUrl.addEventListener("input", () => { state.settings.baseUrl = baseUrl.value; });
      const baseUrlField = field(doc, "API 地址", baseUrl, "远程服务必须使用 HTTPS；localhost、127.0.0.1 和 ::1 可使用 HTTP。");
      baseUrlField.classList.add("ctpo-field-full");
      grid.append(baseUrlField);

      const keyInput = element(doc, "input", { id: createSettingsId(view, "api-key"), type: view.keyVisible ? "text" : "password", autocomplete: "new-password", placeholder: settings.apiKeyConfigured ? "已配置，留空表示保持不变" : "输入 API Key" });
      keyInput.value = view.keyDraft;
      keyInput.addEventListener("input", () => { view.keyDraft = keyInput.value; });
      const keyToggle = actionButton(doc, view.keyVisible ? "隐藏" : "显示", "toggle-key", { icon: "eye", title: "显示或隐藏 API Key" });
      keyToggle.addEventListener("click", () => { view.keyVisible = !view.keyVisible; view.render(); });
      const keyLine = element(doc, "div", { className: "ctpo-inline" }, [keyInput, keyToggle]);
      const keyField = field(doc, "API Key", keyLine, "界面默认遮蔽；显示/隐藏只作用于当前输入草稿，已保存 Key 不回显。此包不宣称操作系统级加密。");
      keyField.classList.add("ctpo-field-full");
      grid.append(keyField);

      const modelInput = element(doc, "input", { id: createSettingsId(view, "model"), type: "text", autocomplete: "off", placeholder: "例如 gpt-5.6", "aria-label": "手动填写模型名称" });
      modelInput.value = settings.model;
      const modelSelect = element(doc, "select", {
        className: "ctpo-model-select",
        "aria-label": "选择已获取模型",
        disabled: view.modelOptions.length === 0,
      });
      modelSelect.append(element(doc, "option", {
        value: "",
        textContent: view.modelOptions.length ? "选择已获取模型" : "请先获取模型",
      }));
      for (const model of view.modelOptions) modelSelect.append(element(doc, "option", { value: model, textContent: model }));
      modelSelect.value = view.modelOptions.includes(settings.model) ? settings.model : "";
      modelInput.addEventListener("input", () => {
        state.settings.model = modelInput.value;
        modelSelect.value = view.modelOptions.includes(modelInput.value) ? modelInput.value : "";
      });
      modelSelect.addEventListener("change", () => {
        if (!modelSelect.value) return;
        state.settings.model = modelSelect.value;
        modelInput.value = modelSelect.value;
      });
      const modelsButton = actionButton(doc, "获取模型", "list-models", { icon: "refresh", title: "请求 Provider 的模型列表" });
      modelsButton.addEventListener("click", async () => {
        setViewBusy(view, true);
        setInlineNotice("正在获取模型列表……");
        try {
          const response = await callNode("list-models", { settings: { ...state.settings, apiKey: view.keyDraft } });
          view.modelOptions = modelOptionValues(response.models);
          setInlineNotice(`已获取 ${view.modelOptions.length} 个模型。`, "success");
          view.render();
        } catch (error) {
          setInlineNotice(`${error.message} 仍可手动填写模型名称。`, "error");
        } finally {
          setViewBusy(view, false);
        }
      });
      const modelLine = element(doc, "div", { className: "ctpo-inline ctpo-model-line" }, [modelInput, modelSelect, modelsButton]);
      const modelField = field(doc, "模型名称", modelLine, "获取模型后可从下拉框选择，也可手动填写模型名称。");
      modelField.classList.add("ctpo-field-full");
      grid.append(modelField);
      providerCard.append(grid);

      const instruction = element(doc, "textarea", { id: createSettingsId(view, "instruction"), "aria-label": "默认优化指令" }, [settings.instruction]);
      instruction.addEventListener("input", () => { state.settings.instruction = instruction.value; });
      const resetInstruction = actionButton(doc, "恢复默认", "reset-instruction", { icon: "refresh" });
      resetInstruction.addEventListener("click", () => {
        state.settings.instruction = RENDERER_DEFAULTS.instruction;
        view.render();
      });
      providerCard.append(field(doc, "默认优化指令", instruction, "只影响最终生成；多轮澄清始终使用固定 JSON 协议指令。"));
      providerCard.append(element(doc, "div", { className: "ctpo-actions" }, [resetInstruction]));

      const historyLimit = element(doc, "select", { id: createSettingsId(view, "history-limit") });
      for (const value of HISTORY_OPTIONS) historyLimit.append(element(doc, "option", { value, textContent: value === 0 ? "0（不保留）" : String(value) }));
      historyLimit.value = String(settings.historyLimit);
      historyLimit.addEventListener("change", () => { state.settings.historyLimit = Number(historyLimit.value); });
      providerCard.append(field(doc, "历史保留数量", historyLimit, "历史只记录原文、结果、澄清回答、模式和时间，不记录 API Key、地址或模型来源。"));

      const actions = element(doc, "div", { className: "ctpo-actions" });
      const save = actionButton(doc, "保存配置", "save", { icon: "check", kind: "primary" });
      save.addEventListener("click", async () => {
        setViewBusy(view, true);
        setInlineNotice("正在保存配置……");
        try {
          const response = await callNode("save-settings", { settings: { ...state.settings, apiKey: view.keyDraft } });
          state.settings = { ...RENDERER_DEFAULTS, ...response.settings, apiKey: "" };
          view.keyDraft = "";
          setInlineNotice("配置已保存。", "success");
          view.render();
          scheduleScan();
        } catch (error) {
          setInlineNotice(error.message, "error");
        } finally {
          setViewBusy(view, false);
        }
      });
      const clearKey = actionButton(doc, "清除 Key", "clear-key", { icon: "trash", kind: "danger" });
      clearKey.addEventListener("click", async () => {
        setViewBusy(view, true);
        setInlineNotice("正在清除 API Key……");
        try {
          const response = await callNode("clear-api-key");
          state.settings = { ...state.settings, ...response.settings };
          view.keyDraft = "";
          setInlineNotice("API Key 已清除。", "success");
          view.render();
        } catch (error) {
          setInlineNotice(error.message, "error");
        } finally {
          setViewBusy(view, false);
        }
      });
      const test = actionButton(doc, "测试连接", "test", { icon: "check" });
      test.addEventListener("click", async () => {
        setViewBusy(view, true);
        setInlineNotice("正在测试连接……");
        try {
          await callNode("test-connection", { settings: { ...state.settings, apiKey: view.keyDraft } });
          setInlineNotice("连接成功。草稿配置未写入磁盘。", "success");
        } catch (error) {
          setInlineNotice(error.message, "error");
        } finally {
          setViewBusy(view, false);
        }
      });
      actions.append(save, clearKey, test);
      const saveFeedback = element(doc, "div", { className: "ctpo-status ctpo-inline-status", role: "status", "aria-live": "polite" }, [view.inlineNotice.text]);
      saveFeedback.dataset.kind = view.inlineNotice.kind;
      view.saveFeedback = saveFeedback;
      providerCard.append(actions, saveFeedback);
      wrapper.append(providerCard);

      const historyCard = element(doc, "section", {
        className: "ctpo-card",
        "aria-labelledby": `${view.id}-history`,
        "data-ctpo-settings-section": "history",
      });
      historyCard.append(element(doc, "h2", { id: `${view.id}-history` }, ["优化历史"]));
      const historyActions = element(doc, "div", { className: "ctpo-actions" });
      const clearHistory = actionButton(doc, "清空历史", "clear-history", { icon: "trash", kind: "danger" });
      clearHistory.addEventListener("click", async () => {
        if (doc.defaultView?.confirm && !doc.defaultView.confirm("清空所有优化历史？此操作不可恢复。")) return;
        try {
          await callNode("clear-history");
          state.history = [];
          view.render();
          setNotice("历史已清空；当前页面的最近一次恢复快照仍保留。", "success");
        } catch (error) {
          setNotice(error.message, "error");
        }
      });
      historyActions.append(clearHistory);
      historyCard.append(historyActions);
      const historyList = element(doc, "ul", { className: "ctpo-history-list" });
      renderHistory(view, historyList);
      historyCard.append(historyList);
      wrapper.append(historyCard);

      const cleanupCard = element(doc, "section", { className: "ctpo-card", "aria-labelledby": `${view.id}-cleanup` });
      cleanupCard.append(
        element(doc, "h2", { id: `${view.id}-cleanup` }, ["卸载前清理数据"]),
        element(doc, "p", { className: "ctpo-hint" }, ["清除 API Key、历史记录和已保存 Provider 配置；包停用不会自动执行此操作。"]),
      );
      const cleanupButton = actionButton(doc, "清理包数据", "clear-package-data", { icon: "trash", kind: "danger" });
      cleanupButton.addEventListener("click", async () => {
        if (doc.defaultView?.confirm && !doc.defaultView.confirm("清除 API Key、历史和 Provider 配置？建议在卸载前执行。")) return;
        setViewBusy(view, true);
        try {
          await callNode("clear-api-key");
          await callNode("clear-history");
          const response = await callNode("save-settings", {
            settings: {
              ...RENDERER_DEFAULTS,
              apiKey: "",
              clearApiKey: true,
            },
          });
          state.settings = { ...RENDERER_DEFAULTS, ...(response.settings ?? {}), apiKey: "" };
          state.history = [];
          state.latestSnapshot = null;
          state.latestRestoreEntry?.restoreButton?.remove();
          state.latestRestoreEntry = null;
          setNotice("包数据已清理，可以继续卸载功能包。", "success");
          view.render();
          scheduleScan();
        } catch (error) {
          setNotice(`包数据清理未完成：${error.message}`, "error");
        } finally {
          setViewBusy(view, false);
        }
      });
      cleanupCard.append(element(doc, "div", { className: "ctpo-actions" }, [cleanupButton]));
      wrapper.append(cleanupCard);

      const status = element(doc, "div", { className: "ctpo-status", role: "status", "aria-live": "polite" }, [state.notice.text || (node ? "" : "Node 权限尚未授权。")]);
      status.dataset.kind = state.notice.kind;
      view.status = status;
      wrapper.append(status);
      container.append(wrapper);
      setViewBusy(view, view.busy);
    };
    state.settingsViews.add(view);
    view.render();
    return () => {
      state.settingsViews.delete(view);
      container.removeAttribute(ROOT_ATTRIBUTE);
    };
  };

  function setViewBusy(view, busy) {
    view.busy = busy;
    if (!view.container) return;
    for (const control of view.container.querySelectorAll?.("button, input, select, textarea") ?? []) {
      control.disabled = busy;
    }
  }

  function field(doc, labelText, control, hintText, hintId) {
    const label = element(doc, "label", { className: "ctpo-field" });
    const labelNode = element(doc, "span", { className: "ctpo-label" }, [labelText]);
    label.append(labelNode, control);
    if (hintText) label.append(element(doc, "span", { className: "ctpo-hint", id: hintId }, [hintText]));
    return label;
  }

  function renderPanel() {
    clearPanelInteractions();
    state.panelHost.replaceChildren();
    const panelState = state.panel;
    if (!panelState || state.disposed) return;
    const panel = element(doc, "section", { className: "ctpo-panel", role: "dialog", "aria-modal": "false", "aria-labelledby": "ctpo-panel-title", "data-ctpo-panel": "true" });
    const close = element(doc, "button", { type: "button", className: "ctpo-panel-close", "aria-label": "关闭面板", title: "关闭面板" }, [svgIcon(doc, "close")]);
    close.addEventListener("click", closePanel);
    const header = element(doc, "div", { className: "ctpo-panel-header", "data-ctpo-drag-handle": "true", tabindex: "0", "aria-label": "拖动预览窗口" }, [
      element(doc, "h2", { id: "ctpo-panel-title" }, [panelState.kind === "clarify" ? "澄清提示词" : "优化结果"]),
      close,
    ]);
    const content = element(doc, "div", { className: `ctpo-panel-content ctpo-panel-${panelState.kind}` });
    const actions = element(doc, "div", { className: "ctpo-actions ctpo-panel-actions" });
    panel.append(header, content, actions);
    if (panelState.kind === "preview") renderPreviewContent(content, actions, panelState);
    else renderClarifyContent(content, actions, panelState);
    state.panelHost.append(panel);
    applyPanelGeometry(panel, panelState, { preservePosition: panelState.layout?.manual === true });
    installPanelInteractions(panel, panelState);
    const firstInput = panel.querySelector("textarea, input, button");
    firstInput?.focus?.();
  }

  function renderPreviewContent(panel, actions, panelState) {
    panel.append(element(doc, "p", { className: "ctpo-hint" }, [panelState.fromHistory ? "这是历史记录预览，不会自动覆盖当前 Composer。" : "检查并编辑结果后，再决定是否应用。"]));
    panel.append(element(doc, "label", { className: "ctpo-label ctpo-panel-source-label" }, ["原始提示词"]));
    panel.append(element(doc, "div", { className: "ctpo-source" }, [panelState.original]));
    const resultLabel = element(doc, "label", { className: "ctpo-label ctpo-panel-result-label", for: "ctpo-preview-result" }, ["优化结果"]);
    const result = element(doc, "textarea", { id: "ctpo-preview-result", className: "ctpo-panel-result", "aria-label": "可编辑的优化结果" }, [panelState.result]);
    result.addEventListener("input", () => { panelState.result = result.value; });
    panel.append(resultLabel, result);
    const contextCurrent = panelState.context
      ? isSameComposerContext(panelState.context, panelState.context.element, currentLocationHref(panelState.context.element), panelState.original)
      : true;
    if (panelState.context && !contextCurrent) panel.append(element(doc, "div", { className: "ctpo-status", role: "alert", "data-kind": "error" }, ["原 Composer 已变化。为避免覆盖新内容，应用按钮已停用。"]));
    if (panelState.notice) panel.append(element(doc, "div", { className: "ctpo-status" }, [panelState.notice]));
    const apply = actionButton(doc, "应用结果", "apply-preview", { icon: "check", kind: "primary", disabled: Boolean(panelState.context && !contextCurrent) });
    apply.addEventListener("click", async () => {
      let target = panelState.context?.element;
      if (panelState.context) {
        if (!isSameComposerContext(panelState.context, target, currentLocationHref(target), panelState.original)) {
          renderPanel();
          return;
        }
      } else {
        target = currentComposer();
        if (!target) {
          panelState.notice = "当前页面没有可用的 Composer。";
          renderPanel();
          return;
        }
      }
      replaceInputText(target, panelState.result);
      try {
        await persistAccepted({ original: panelState.original, result: panelState.result, clarifications: panelState.clarifications, mode: panelState.mode });
        closePanel();
        showToast("已应用优化结果。", "success");
      } catch (error) {
        panelState.notice = `结果已应用，但历史保存失败：${error.message}`;
        renderPanel();
      }
    });
    const copy = actionButton(doc, "复制结果", "copy-preview", { icon: "copy" });
    copy.addEventListener("click", async () => {
      try {
        await copyText(panelState.result);
        await persistAccepted({ original: panelState.original, result: panelState.result, clarifications: panelState.clarifications, mode: panelState.mode });
        panelState.notice = "已复制，并已按明确接受动作保存历史。";
        renderPanel();
      } catch (error) {
        panelState.notice = error.message;
        renderPanel();
      }
    });
    actions.append(apply, copy, actionButton(doc, "取消", "cancel-preview", { icon: "cancel" }));
    actions.querySelector('[data-ctpo-action="cancel-preview"]').addEventListener("click", closePanel);
  }

  function renderClarifyContent(panel, actions, panelState) {
    panel.append(element(doc, "p", { className: "ctpo-hint" }, [`最多 3 轮，每轮最多 3 个问题。当前第 ${panelState.round} 轮；留空或跳过都可以。`]));
    panel.append(element(doc, "label", { className: "ctpo-label" }, ["原始提示词"]));
    panel.append(element(doc, "div", { className: "ctpo-source" }, [panelState.original]));
    if (panelState.notice) panel.append(element(doc, "div", { className: "ctpo-status", role: "alert", "data-kind": "error" }, [panelState.notice]));
    if (panelState.busy) {
      panel.append(element(doc, "div", { className: "ctpo-status" }, ["正在判断是否需要澄清……"]));
    } else if (panelState.questions.length) {
      const questions = element(doc, "div", { className: "ctpo-question-list" });
      panelState.questions.forEach((question, index) => {
        const input = element(doc, "textarea", { "data-ctpo-question-index": index, "aria-label": `澄清问题 ${index + 1}`, placeholder: "可留空或跳过" });
        questions.append(element(doc, "div", { className: "ctpo-question" }, [element(doc, "p", {}, [`${index + 1}. ${question}`]), input]));
      });
      panel.append(questions);
    } else if (panelState.ready) {
      panel.append(element(doc, "div", { className: "ctpo-status", "data-kind": "success" }, ["模型判断信息已足够。点击“生成预览”继续。"]));
    }
    if (!panelState.busy && panelState.questions.length) {
      const submitLabel = panelState.round >= 3 ? "提交回答并生成预览" : "提交回答";
      const submit = actionButton(doc, submitLabel, "submit-clarify", { icon: "check", kind: "primary" });
      submit.addEventListener("click", () => submitClarification(panelState));
      actions.append(submit);
      const skip = actionButton(doc, "跳过并生成预览", "skip-clarify", { icon: "cancel" });
      skip.addEventListener("click", () => generateClarifyResult(panelState));
      actions.append(skip);
    }
    if (!panelState.busy && (panelState.ready || panelState.round >= 3)) {
      const generate = actionButton(doc, "生成预览", "generate-clarify", { icon: "spark", kind: "primary" });
      generate.addEventListener("click", () => generateClarifyResult(panelState));
      actions.append(generate);
    }
    const cancel = actionButton(doc, "取消", "cancel-clarify", { icon: "cancel" });
    cancel.addEventListener("click", closePanel);
    actions.append(cancel);
  }

  async function runClarifyRound(panelState) {
    if (state.disposed || state.panel !== panelState) return;
    const operationId = makeId("clarify");
    panelState.operationId = operationId;
    panelState.operationMethod = "clarify-round";
    panelState.busy = true;
    state.activeOperations.set(operationId, { id: operationId, method: "clarify-round", context: panelState.context });
    renderPanel();
    try {
      const response = await callNode("clarify-round", {
        operationId,
        text: panelState.original,
        round: panelState.round,
        clarifications: panelState.answers,
      });
      if (state.panel !== panelState) return;
      panelState.questions = Array.isArray(response.questions) ? response.questions.slice(0, 3) : [];
      panelState.ready = response.readyToGenerate === true;
      panelState.busy = false;
      panelState.operationId = null;
      panelState.operationMethod = null;
      renderPanel();
    } catch (error) {
      if (state.panel !== panelState) return;
      panelState.busy = false;
      panelState.operationId = null;
      panelState.operationMethod = null;
      if (error.code !== "cancelled") panelState.notice = error.message;
      renderPanel();
    } finally {
      state.activeOperations.delete(operationId);
    }
  }

  function collectClarificationAnswers(panelState) {
    return [...state.panelHost.querySelectorAll("[data-ctpo-question-index]")].map((input, index) => ({
      question: panelState.questions[index] ?? "",
      answer: input.value ?? "",
    }));
  }

  async function submitClarification(panelState) {
    if (state.panel !== panelState || panelState.busy) return;
    panelState.answers.push(...collectClarificationAnswers(panelState));
    if (panelState.round >= 3) {
      await generateClarifyResult(panelState);
      return;
    }
    panelState.round += 1;
    panelState.questions = [];
    panelState.ready = false;
    await runClarifyRound(panelState);
  }

  async function generateClarifyResult(panelState) {
    if (state.panel !== panelState || panelState.busy) return;
    panelState.answers.push(...collectClarificationAnswers(panelState));
    panelState.busy = true;
    const operationId = makeId("clarify-final");
    panelState.operationId = operationId;
    panelState.operationMethod = "optimize";
    state.activeOperations.set(operationId, { id: operationId, method: "optimize", context: panelState.context });
    renderPanel();
    try {
      const response = await callNode("optimize", {
        operationId,
        text: panelState.original,
        clarifications: panelState.answers,
      });
      if (state.panel !== panelState) return;
      showPreview({
        original: panelState.original,
        result: String(response.result ?? "").trim(),
        clarifications: panelState.answers,
        mode: "clarify",
        context: panelState.context,
        layout: panelState.layout,
      });
    } catch (error) {
      if (state.panel !== panelState) return;
      panelState.busy = false;
      panelState.operationId = null;
      panelState.operationMethod = null;
      if (error.code !== "cancelled") panelState.notice = error.message;
      renderPanel();
    } finally {
      state.activeOperations.delete(operationId);
    }
  }

  const onDocumentKeyDown = (event) => {
    if (event.key !== "Escape") return;
    if (state.settingsDialog) {
      event.preventDefault?.();
      closeSettingsDialog({ restoreFocus: true });
      return;
    }
    if (state.composerMenu) {
      event.preventDefault?.();
      closeComposerMenu();
      return;
    }
    if (state.panel) {
      event.preventDefault?.();
      closePanel();
    }
  };

  const onDocumentPointerDown = (event) => {
    const menu = state.composerMenu;
    if (!menu || menu.element.contains(event.target) || menu.entry.menuButton?.contains?.(event.target)) return;
    closeComposerMenu();
  };

  async function copyText(text) {
    if (doc.defaultView?.navigator?.clipboard?.writeText) {
      await doc.defaultView.navigator.clipboard.writeText(text);
      return;
    }
    const fallback = element(doc, "textarea", { className: "ctpo-visually-hidden", readonly: true, value: text });
    doc.body?.append(fallback);
    fallback.select();
    const copied = doc.execCommand?.("copy");
    fallback.remove();
    if (!copied) throw new Error("无法访问剪贴板，请手动复制结果。");
  }

  const loadSettings = async () => {
    if (!node) {
      setNotice("Node 权限尚未授权。", "error");
      return;
    }
    try {
      const response = await callNode("load-settings");
      state.settings = { ...RENDERER_DEFAULTS, ...(response.settings ?? {}) };
      state.ready = true;
      refreshSettingsViews();
      await refreshHistory();
      scheduleScan();
    } catch (error) {
      setNotice(error.message, "error");
    }
  };

  let settingsRegistration = null;
  const closeSettingsDialog = ({ restoreFocus = false } = {}) => {
    const dialog = state.settingsDialog;
    state.settingsDialog = null;
    dialog?.cleanup?.();
    dialog?.backdrop?.remove();
    if (restoreFocus && dialog?.returnFocus?.isConnected) dialog.returnFocus.focus?.();
  };

  const openSettingsDialog = ({ focusHistory = false } = {}) => {
    closePanel();
    closeSettingsDialog();
    const HTMLElementCtor = doc.defaultView?.HTMLElement;
    const returnFocus = HTMLElementCtor && doc.activeElement instanceof HTMLElementCtor
      ? doc.activeElement
      : null;
    const backdrop = element(doc, "div", {
      className: "ctpo-settings-dialog-backdrop",
      "data-ctpo-settings-dialog": "true",
    });
    const dialog = element(doc, "section", {
      className: "ctpo-settings-dialog",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "ctpo-settings-dialog-title",
    });
    const header = element(doc, "header", { className: "ctpo-settings-dialog-header" }, [
      element(doc, "h2", { id: "ctpo-settings-dialog-title" }, ["提示词优化设置"]),
    ]);
    const close = element(doc, "button", {
      type: "button",
      className: "ctpo-panel-close",
      "aria-label": "关闭提示词优化设置",
      title: "关闭",
    }, [svgIcon(doc, "close")]);
    close.addEventListener("click", () => closeSettingsDialog({ restoreFocus: true }));
    header.append(close);
    const content = element(doc, "div", { className: "ctpo-settings-dialog-content" });
    dialog.append(header, content);
    backdrop.append(dialog);
    state.settingsDialogHost?.append(backdrop);
    const cleanup = buildSettingsView(content, { embedded: true });
    state.settingsDialog = { backdrop, cleanup, returnFocus };
    backdrop.addEventListener("pointerdown", (event) => {
      if (event.target === backdrop) closeSettingsDialog({ restoreFocus: true });
    });
    const history = focusHistory
      ? content.querySelector?.('[data-ctpo-settings-section="history"]')
      : null;
    if (history) history.scrollIntoView?.({ block: "start" });
    else close.focus?.();
  };

  const openSettings = ({ focusHistory = false } = {}) => {
    closeComposerMenu();
    if (!focusHistory && typeof settingsRegistration?.open === "function") {
      try {
        settingsRegistration.open();
        return;
      } catch (error) {
        setNotice(`原生设置页不可用，已打开包内设置：${error.message}`, "error");
      }
    }
    openSettingsDialog({ focusHistory });
  };

  const registerSettings = () => {
    const register = ui?.settingsSections?.register;
    if (typeof register !== "function") return;
    try {
      const registration = register({
        apiVersion: 1,
        id: "prompt-optimizer",
        title: "提示词优化",
        group: "personal",
        icon: "personalization",
        mount: buildSettingsView,
      });
      settingsRegistration = typeof registration === "function" ? { unregister: registration } : registration;
    } catch (error) {
      setNotice(`设置页注册失败：${error.message}`, "error");
    }
  };

  const cleanup = () => {
    if (state.disposed) return;
    state.disposed = true;
    state.observer?.disconnect?.();
    if (state.scanTimer) clearTimeout(state.scanTimer);
    if (state.toastTimer) clearTimeout(state.toastTimer);
    doc.defaultView?.removeEventListener("resize", reflowPanel);
    doc.defaultView?.removeEventListener("resize", reflowComposerButtons);
    doc.removeEventListener("scroll", reflowPanel, true);
    doc.removeEventListener("scroll", reflowComposerButtons, true);
    doc.removeEventListener("keydown", onDocumentKeyDown);
    doc.removeEventListener("pointerdown", onDocumentPointerDown, true);
    state.toastTimer = null;
    for (const entry of [...state.attached.values()]) detachComposer(entry);
    for (const operation of state.activeOperations.values()) {
      node?.invoke?.(operation.method, { operationId: operation.id, cancel: true }).catch?.(() => {});
    }
    state.activeOperations.clear();
    closeComposerMenu();
    closeSettingsDialog();
    settingsRegistration?.unregister?.();
    settingsRegistration?.dispose?.();
    clearPanelInteractions();
    state.panelHost.replaceChildren();
    state.uiRoot.remove();
    root.removeAttribute(ROOT_ATTRIBUTE);
  };

  doc.defaultView?.addEventListener("resize", reflowPanel);
  doc.defaultView?.addEventListener("resize", reflowComposerButtons);
  doc.addEventListener("scroll", reflowPanel, true);
  doc.addEventListener("scroll", reflowComposerButtons, true);
  doc.addEventListener("keydown", onDocumentKeyDown);
  doc.addEventListener("pointerdown", onDocumentPointerDown, true);
  state.observer = new MutationObserver((records) => {
    if (records.some(({ target }) => !uiRoot.contains(target))) scheduleScan();
  });
  state.observer.observe(doc.body ?? root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "aria-expanded",
      "aria-hidden",
      "aria-label",
      "aria-haspopup",
      "class",
      "data-composer-placement",
      "data-open",
      "data-state",
      "data-testid",
      "hidden",
      "role",
      "style",
      "title",
    ],
  });
  registerSettings();
  if (typeof onCleanup === "function") {
    onCleanup(cleanup);
    state.cleanupRegistered = true;
  }
  void loadSettings();
  return { dispose: cleanup };
}

export { RENDERER_DEFAULTS };
