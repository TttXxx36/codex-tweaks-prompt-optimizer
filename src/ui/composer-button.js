import {
  BUTTON_CLASS,
  RESTORE_BUTTON_CLASS,
  ROOT_ATTRIBUTE,
  findComposerActionAnchor,
  getComposerButtonPosition,
  isExcludedFromComposer,
  isSameComposerContext,
  replaceInputText,
  currentLocationHref,
} from "../renderer-core.js";
import { actionButton, element, svgIcon } from "./dom.js";

export class ComposerButtonManager {
  constructor({
    doc,
    uiRoot,
    viewportSize,
    getSettings,
    onStartOptimization,
    onOpenSettings,
    onSelectPreset,
    onToast,
    onRecordGeometry,
    scheduleScan,
  }) {
    this.doc = doc;
    this.uiRoot = uiRoot;
    this.viewportSize = viewportSize;
    this.getSettings = getSettings;
    this.onStartOptimization = onStartOptimization;
    this.onOpenSettings = onOpenSettings;
    this.onSelectPreset = onSelectPreset;
    this.onToast = onToast;
    this.onRecordGeometry = onRecordGeometry;
    this.scheduleScan = scheduleScan;

    this.composerButtonHost = element(doc, "div", { [ROOT_ATTRIBUTE]: "", className: "ctpo-composer-host" });
    this.composerButtonHost.style.inset = "0";
    this.composerButtonHost.style.pointerEvents = "none";
    this.composerButtonHost.style.position = "fixed";
    this.composerButtonHost.style.zIndex = "2147482999";
    this.uiRoot.append(this.composerButtonHost);

    this.attached = new Map();
    this.composerMenu = null;
    this.latestSnapshot = null;
    this.latestRestoreEntry = null;
    this.disposed = false;
  }

  isMenuOpen() {
    return Boolean(this.composerMenu);
  }

  closeComposerMenu() {
    if (!this.composerMenu) return;
    this.composerMenu.entry?.menuButton?.setAttribute("aria-expanded", "false");
    this.composerMenu.element?.remove();
    this.composerMenu = null;
  }

  openComposerMenu(entry) {
    if (!entry?.button || !this.composerButtonHost || this.disposed) return;
    if (this.composerMenu?.entry === entry) {
      this.closeComposerMenu();
      return;
    }
    this.closeComposerMenu();
    const menu = element(this.doc, "div", {
      className: "ctpo-composer-menu",
      role: "menu",
      "aria-label": "提示词优化菜单",
    });

    const settings = this.getSettings();
    const presets = Array.isArray(settings.presets) && settings.presets.length
      ? settings.presets
      : [
        { id: "general", name: "通用优化" },
        { id: "code", name: "编程开发" },
        { id: "concise", name: "精准精简" },
        { id: "cot", name: "深度推理 (CoT)" },
        { id: "translate", name: "中英转译" },
      ];

    // Section 1: 场景预设
    const presetLabel = element(this.doc, "div", { className: "ctpo-menu-section-label" }, ["场景预设"]);
    const presetSection = element(this.doc, "div", { className: "ctpo-menu-presets" }, [presetLabel]);

    for (const p of presets) {
      const isSelected = (settings.activePresetId || "general") === p.id;
      const checkIcon = isSelected ? svgIcon(this.doc, "check") : element(this.doc, "span", { style: "display:inline-block;width:13px;" });
      const btn = element(this.doc, "button", {
        type: "button",
        className: "ctpo-menu-item",
        role: "menuitem",
        "data-selected": isSelected ? "true" : "false",
        "data-ctpo-tooltip": `切换为【${p.name}】场景预设`,
      }, [
        element(this.doc, "span", { className: "ctpo-menu-item-icon" }, [checkIcon]),
        element(this.doc, "span", { style: "overflow:hidden;text-overflow:ellipsis;" }, [p.name]),
      ]);
      btn.addEventListener("click", async () => {
        this.closeComposerMenu();
        if (typeof this.onSelectPreset === "function") {
          await this.onSelectPreset(p);
        }
      });
      presetSection.append(btn);
    }
    menu.append(presetSection);

    // Section 2: 快捷操作
    const actionLabel = element(this.doc, "div", { className: "ctpo-menu-section-label" }, ["快捷操作"]);
    const actionSection = element(this.doc, "div", { style: "display:flex;flex-direction:column;gap:2px;" }, [actionLabel]);

    const settingsBtn = element(this.doc, "button", {
      type: "button",
      className: "ctpo-menu-item",
      role: "menuitem",
    }, [
      element(this.doc, "span", { className: "ctpo-menu-item-icon" }, [svgIcon(this.doc, "spark")]),
      element(this.doc, "span", {}, ["提示词优化设置"]),
    ]);
    settingsBtn.addEventListener("click", () => {
      this.closeComposerMenu();
      this.onOpenSettings?.();
    });

    const historyBtn = element(this.doc, "button", {
      type: "button",
      className: "ctpo-menu-item",
      role: "menuitem",
    }, [
      element(this.doc, "span", { className: "ctpo-menu-item-icon" }, [svgIcon(this.doc, "eye")]),
      element(this.doc, "span", {}, ["优化历史与收藏"]),
    ]);
    historyBtn.addEventListener("click", () => {
      this.closeComposerMenu();
      this.onOpenSettings?.({ focusHistory: true });
    });

    actionSection.append(settingsBtn, historyBtn);
    menu.append(actionSection);

    this.composerButtonHost.append(menu);

    const triggerRect = entry.button.getBoundingClientRect?.();
    const menuRect = menu.getBoundingClientRect?.();
    const viewport = this.viewportSize();
    const width = Number(menuRect?.width) || 210;
    const height = Number(menuRect?.height) || 240;

    let left = Number(triggerRect?.left) || 8;
    if (left + width > viewport.width - 8) {
      left = Math.max(8, (Number(triggerRect?.right) || width + 8) - width);
    }
    let top = (Number(triggerRect?.top) || 0) - height - 12;
    if (top < 8) {
      top = Math.min((Number(triggerRect?.bottom) || 0) + 12, viewport.height - height - 8);
    }
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    this.composerMenu = { entry, element: menu };
    entry.menuButton?.setAttribute("aria-expanded", "true");
    settingsBtn.focus?.();
  }

  updateButton(entry, busy) {
    if (!entry?.button) return;
    entry.busy = busy;
    entry.button.dataset.busy = busy ? "true" : "false";
    entry.button.setAttribute("aria-busy", busy ? "true" : "false");
    entry.button.replaceChildren(svgIcon(this.doc, busy ? "cancel" : "spark"), this.doc.createTextNode(busy ? "取消" : "优化"));
    entry.button.removeAttribute("title");
    entry.button.setAttribute("data-ctpo-tooltip", busy ? "取消当前优化请求" : "优化当前提示词");
  }

  ensureRestoreButton(entry, snapshot) {
    if (!entry?.button || !this.composerButtonHost || !snapshot) return;
    if (this.latestRestoreEntry && this.latestRestoreEntry !== entry) {
      this.latestRestoreEntry.restoreButton?.remove();
      this.latestRestoreEntry.restoreButton = null;
    }
    this.latestSnapshot = snapshot;
    this.latestRestoreEntry = entry;
    if (!entry.restoreButton) {
      const restore = actionButton(this.doc, "恢复原文", "restore", { icon: "refresh", title: "恢复本次优化前的原文" });
      restore.classList.add(RESTORE_BUTTON_CLASS);
      restore.addEventListener("click", () => {
        if (!isSameComposerContext(snapshot.context, entry.element, currentLocationHref(entry.element), snapshot.result)) {
          this.onToast?.("当前 Composer 已变化，未恢复旧原文。", "error");
          return;
        }
        replaceInputText(entry.element, snapshot.original);
        entry.restoreButton?.remove();
        entry.restoreButton = null;
        if (this.latestSnapshot === snapshot) this.latestSnapshot = null;
        if (this.latestRestoreEntry === entry) this.latestRestoreEntry = null;
        this.onToast?.("已恢复本次优化前的原文", "success");
      });
      restore.hidden = true;
      restore.style.pointerEvents = "auto";
      restore.style.position = "fixed";
      restore.style.zIndex = "2147482999";
      this.composerButtonHost.append(restore);
      entry.restoreButton = restore;
      this.positionComposerButton(entry);
    }
  }

  attachComposer(composer) {
    if (this.attached.has(composer) || composer.closest?.(`[${ROOT_ATTRIBUTE}]`)) return;
    const anchor = findComposerActionAnchor(composer);
    if (!anchor?.parentElement) return;

    const button = element(this.doc, "button", {
      type: "button",
      className: BUTTON_CLASS,
      "aria-label": "优化当前提示词",
      "data-ctpo-tooltip": "优化当前提示词",
      "data-codex-tweaks-prompt-optimizer": "button",
      hidden: true,
    }, [svgIcon(this.doc, "spark"), "优化"]);

    const menuButton = element(this.doc, "button", {
      type: "button",
      className: "ct-prompt-optimizer-menu-button",
      "aria-label": "打开提示词优化菜单",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      "data-ctpo-tooltip": "提示词优化菜单",
      hidden: true,
    }, [svgIcon(this.doc, "chevron")]);

    const entry = { element: composer, anchor, button, menuButton, restoreButton: null, operation: null, busy: false, lastPos: null, lastAnchorRect: null };
    entry.debugPasteListener = () => {
      if (this.isDebugGeometryEnabled?.()) {
        this.onRecordGeometry?.(entry, "paste-event", entry.anchor);
        this.scheduleScan?.();
      }
    };
    entry.debugInputListener = () => {
      if (this.isDebugGeometryEnabled?.()) {
        this.onRecordGeometry?.(entry, "input-event", entry.anchor);
        this.scheduleScan?.();
      }
    };
    composer.addEventListener?.("paste", entry.debugPasteListener);
    composer.addEventListener?.("input", entry.debugInputListener);
    button.addEventListener("click", () => this.onStartOptimization?.(entry));
    menuButton.addEventListener("click", () => this.openComposerMenu(entry));

    this.placeComposerButton(entry, anchor, { previousAnchor: null, phase: "attach" });
    this.attached.set(composer, entry);
  }

  detachComposer(entry) {
    entry.element.removeEventListener?.("paste", entry.debugPasteListener);
    entry.element.removeEventListener?.("input", entry.debugInputListener);
    entry.button.remove();
    entry.menuButton?.remove();
    entry.restoreButton?.remove();
    if (this.latestRestoreEntry === entry) {
      this.latestRestoreEntry = null;
      this.latestSnapshot = null;
    }
    if (this.composerMenu?.entry === entry) {
      this.closeComposerMenu();
    }
    this.attached.delete(entry.element);
  }

  positionComposerButton(entry, { previousAnchor = null, phase = "position" } = {}) {
    if (!entry.button.parentElement || this.disposed) return;
    const anchorRect = entry.anchor.getBoundingClientRect?.();
    if (!anchorRect) return;

    // Passive size caching: avoid layout thrashing by using constant button sizes
    const totalButtonWidth = 68 + (entry.menuButton ? 24 : 0);
    const combinedButtonRect = { width: totalButtonWidth, height: 28 };

    // Dirty flag check: skip DOM style mutations if anchor rectangle is unchanged
    const lastRect = entry.lastAnchorRect;
    if (
      lastRect
      && Math.abs(lastRect.left - (Number(anchorRect.left) || 0)) < 0.5
      && Math.abs(lastRect.top - (Number(anchorRect.top) || 0)) < 0.5
      && Math.abs(lastRect.height - (Number(anchorRect.height) || 0)) < 0.5
      && !entry.button.hidden
    ) {
      return;
    }

    const position = getComposerButtonPosition(anchorRect, combinedButtonRect, this.viewportSize(), 6);
    if (!position) {
      entry.button.hidden = true;
      if (entry.menuButton) entry.menuButton.hidden = true;
      if (entry.restoreButton) entry.restoreButton.hidden = true;
      entry.lastAnchorRect = null;
      return;
    }

    entry.lastAnchorRect = {
      left: Number(anchorRect.left) || 0,
      top: Number(anchorRect.top) || 0,
      height: Number(anchorRect.height) || 0,
    };

    const btnW = 68;
    entry.button.style.left = `${position.left}px`;
    entry.button.style.top = `${position.top}px`;
    entry.button.hidden = false;

    if (entry.menuButton) {
      entry.menuButton.style.left = `${position.left + btnW}px`;
      entry.menuButton.style.top = `${position.top}px`;
      entry.menuButton.hidden = false;
    }

    if (entry.restoreButton) {
      const restoreWidth = 96;
      entry.restoreButton.style.left = `${position.left - restoreWidth - 6}px`;
      entry.restoreButton.style.top = `${position.top}px`;
      entry.restoreButton.hidden = false;
    }
  }

  placeComposerButton(entry, anchor, { previousAnchor = null, phase = "place" } = {}) {
    entry.anchor = anchor;
    entry.button.style.pointerEvents = "auto";
    entry.button.style.position = "fixed";
    entry.button.style.zIndex = "2147482999";
    this.composerButtonHost.append(entry.button);

    if (entry.menuButton) {
      entry.menuButton.style.pointerEvents = "auto";
      entry.menuButton.style.position = "fixed";
      entry.menuButton.style.zIndex = "2147482999";
      this.composerButtonHost.append(entry.menuButton);
    }
    this.positionComposerButton(entry, { previousAnchor, phase });
  }

  reflowComposerButtons(event) {
    if (this.disposed) return;
    const scroller = event?.target;
    const isGlobalScroll = !scroller
      || scroller === this.doc
      || scroller === this.doc.defaultView
      || scroller === this.doc.documentElement
      || scroller === this.doc.body;

    for (const entry of this.attached.values()) {
      if (!isGlobalScroll && (isExcludedFromComposer(scroller) || !scroller.contains?.(entry.anchor))) continue;
      const previousAnchor = entry.anchor;
      const nextAnchor = findComposerActionAnchor(entry.element, entry.anchor);
      if (!nextAnchor) {
        entry.button.hidden = true;
        if (entry.menuButton) entry.menuButton.hidden = true;
        if (entry.restoreButton) entry.restoreButton.hidden = true;
      } else if (nextAnchor !== entry.anchor) {
        this.placeComposerButton(entry, nextAnchor, { previousAnchor, phase: "reflow-anchor-change" });
      } else {
        this.positionComposerButton(entry, { previousAnchor, phase: "reflow" });
      }
    }
  }

  dispose() {
    this.disposed = true;
    this.closeComposerMenu();
    for (const entry of [...this.attached.values()]) {
      this.detachComposer(entry);
    }
    this.attached.clear();
    this.composerButtonHost?.remove();
    this.composerButtonHost = null;
  }
}
