import { ROOT_ATTRIBUTE } from "../renderer-core.js";
import { element } from "./dom.js";

export class ToastManager {
  constructor(doc, uiRoot) {
    this.doc = doc;
    this.uiRoot = uiRoot;
    this.toastHost = element(doc, "div", { [ROOT_ATTRIBUTE]: "", className: "ctpo-toast-host" });
    this.toastHost.style.inset = "0";
    this.toastHost.style.pointerEvents = "none";
    this.toastHost.style.position = "fixed";
    this.toastHost.style.zIndex = "2147483001";
    this.uiRoot.append(this.toastHost);
    this.toastTimer = null;
    this.disposed = false;
  }

  show(message, kind = "info") {
    if (this.disposed) return;
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    const toast = element(this.doc, "div", {
      className: `ctpo-toast ctpo-toast-${kind}`,
      role: "status",
      "aria-live": "polite",
    }, [message]);
    toast.style.pointerEvents = "auto";
    toast.style.position = "fixed";
    toast.style.right = "16px";
    toast.style.bottom = "16px";
    toast.style.zIndex = "2147483001";
    this.toastHost.replaceChildren(toast);
    this.toastTimer = setTimeout(() => {
      this.toastTimer = null;
      if (toast.parentElement === this.toastHost) {
        this.toastHost.replaceChildren();
      }
    }, 5_000);
  }

  dispose() {
    this.disposed = true;
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    this.toastHost?.remove();
    this.toastHost = null;
  }
}
