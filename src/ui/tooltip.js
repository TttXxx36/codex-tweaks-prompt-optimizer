import { ROOT_ATTRIBUTE } from "../renderer-core.js";
import { element } from "./dom.js";

export class CustomTooltipManager {
  constructor(doc, uiRoot, viewportSize) {
    this.doc = doc;
    this.uiRoot = uiRoot;
    this.viewportSize = typeof viewportSize === "function" ? viewportSize : () => ({
      width: doc.defaultView?.innerWidth ?? 1200,
      height: doc.defaultView?.innerHeight ?? 800,
    });
    this.activeTarget = null;
    this.timer = null;
    this.disposed = false;

    this.tooltipElement = element(doc, "div", {
      [ROOT_ATTRIBUTE]: "",
      className: "ctpo-tooltip",
      role: "tooltip",
      "aria-hidden": "true",
    });
    this.uiRoot.append(this.tooltipElement);

    this.onPointerOver = (e) => {
      if (this.disposed) return;
      const target = e.target?.closest?.("[data-ctpo-tooltip]");
      if (!target) return;
      const text = target.getAttribute("data-ctpo-tooltip");
      if (!text) return;
      this.activeTarget = target;
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (this.activeTarget === target && target.isConnected && !this.disposed) {
          this.show(target, text);
        }
      }, 180);
    };

    this.onPointerOut = (e) => {
      const target = e.target?.closest?.("[data-ctpo-tooltip]");
      if (target && target === this.activeTarget) {
        this.hide();
      }
    };

    this.onPointerDown = () => {
      this.hide();
    };

    this.doc.addEventListener("pointerover", this.onPointerOver, true);
    this.doc.addEventListener("pointerout", this.onPointerOut, true);
    this.doc.addEventListener("pointerdown", this.onPointerDown, true);
  }

  show(target, text) {
    if (!target || !text || !target.isConnected || this.disposed) return;
    this.tooltipElement.textContent = text;
    this.tooltipElement.style.visibility = "hidden";
    this.tooltipElement.style.display = "block";
    this.tooltipElement.style.opacity = "0";

    const targetRect = target.getBoundingClientRect?.();
    const tooltipRect = this.tooltipElement.getBoundingClientRect?.();
    const viewport = this.viewportSize();

    if (!targetRect || !tooltipRect) return;

    const tooltipWidth = Number(tooltipRect.width) || 120;
    const tooltipHeight = Number(tooltipRect.height) || 26;

    let left = targetRect.left + (targetRect.width - tooltipWidth) / 2;
    left = Math.max(8, Math.min(left, viewport.width - tooltipWidth - 8));

    let top = targetRect.bottom + 6;
    if (top + tooltipHeight > viewport.height - 8) {
      top = Math.max(8, targetRect.top - tooltipHeight - 6);
    }

    this.tooltipElement.style.left = `${Math.round(left)}px`;
    this.tooltipElement.style.top = `${Math.round(top)}px`;
    this.tooltipElement.style.visibility = "visible";
    this.tooltipElement.style.opacity = "1";
    this.tooltipElement.style.transform = "translateY(0)";
  }

  hide() {
    this.activeTarget = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.tooltipElement) {
      this.tooltipElement.style.opacity = "0";
      this.tooltipElement.style.visibility = "hidden";
      this.tooltipElement.style.transform = "translateY(2px)";
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.hide();
    this.doc.removeEventListener("pointerover", this.onPointerOver, true);
    this.doc.removeEventListener("pointerout", this.onPointerOut, true);
    this.doc.removeEventListener("pointerdown", this.onPointerDown, true);
    this.tooltipElement?.remove();
    this.tooltipElement = null;
  }
}
