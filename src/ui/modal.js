import { ROOT_ATTRIBUTE } from "../renderer-core.js";
import { actionButton, element } from "./dom.js";

export function showModalDialog(doc, {
  title,
  message = "",
  inputPlaceholder = "",
  initialValue = "",
  showInput = false,
  confirmText = "确定",
  cancelText = "取消",
  isDanger = false,
  onConfirm,
}) {
  const existing = doc.querySelector(".ctpo-modal-overlay");
  if (existing) existing.remove();

  const overlay = element(doc, "div", { className: "ctpo-modal-overlay" });
  overlay.setAttribute(ROOT_ATTRIBUTE, "");
  const modal = element(doc, "div", { className: "ctpo-modal-dialog", role: "dialog", "aria-modal": "true" });

  const titleEl = element(doc, "h3", { className: "ctpo-modal-title" }, [title]);
  modal.append(titleEl);

  if (message) {
    modal.append(element(doc, "p", { className: "ctpo-modal-message" }, [message]));
  }

  let inputEl = null;
  if (showInput) {
    inputEl = element(doc, "input", {
      type: "text",
      className: "ctpo-modal-input",
      placeholder: inputPlaceholder,
      value: initialValue,
    });
    modal.append(inputEl);
  }

  const actions = element(doc, "div", { className: "ctpo-actions ctpo-modal-actions" });
  const confirmBtn = actionButton(doc, confirmText, "modal-confirm", {
    icon: "check",
    kind: isDanger ? "danger" : "primary",
  });
  const cancelBtn = actionButton(doc, cancelText, "modal-cancel", { icon: "cancel" });

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Enter" && (!inputEl || doc.activeElement === inputEl)) {
      e.preventDefault();
      submit();
    }
  };

  const close = () => {
    overlay.remove();
    doc.removeEventListener("keydown", onKeyDown);
  };

  const submit = async () => {
    const value = inputEl ? inputEl.value.trim() : "";
    if (showInput && !value) {
      inputEl.focus();
      return;
    }
    close();
    if (typeof onConfirm === "function") {
      await onConfirm(value);
    }
  };

  confirmBtn.addEventListener("click", submit);
  cancelBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  actions.append(confirmBtn, cancelBtn);
  modal.append(actions);
  overlay.append(modal);
  doc.body?.append(overlay);
  doc.addEventListener("keydown", onKeyDown);

  if (inputEl) {
    setTimeout(() => {
      inputEl.focus();
      inputEl.select();
    }, 20);
  } else {
    setTimeout(() => confirmBtn.focus(), 20);
  }
}
