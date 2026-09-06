// Toasts and confirmations.

import { html, mount } from "./dom.js";

function container() {
  let node = document.querySelector(".bp-toasts");
  if (!node) {
    node = document.createElement("div");
    node.className = "bp-toasts";
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    document.body.appendChild(node);
  }
  return node;
}

export function toast(message, kind = "info", ms = 4500) {
  const node = document.createElement("div");
  node.className = `bp-toast bp-toast--${kind}`;
  node.innerHTML = html`<div>${message}</div>`;
  container().appendChild(node);
  setTimeout(() => node.remove(), ms);
}

export const notify = {
  success: (message) => toast(message, "success"),
  error: (message) => toast(message, "error", 7000),
  info: (message) => toast(message, "info"),
};

/**
 * A promise-based confirm dialog. Used for anything destructive or
 * anything that starts spending money.
 */
export function confirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "bp-modal-backdrop";
    backdrop.innerHTML = html`
      <div class="bp-modal" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="bp-modal__header"><h3>${title}</h3></div>
        <p class="bp-muted">${message}</p>
        <div class="bp-modal__footer">
          <button type="button" class="bp-btn bp-btn--ghost" data-close>${cancelLabel}</button>
          <button type="button" class="bp-btn bp-btn--${tone}" data-confirm>${confirmLabel}</button>
        </div>
      </div>
    `;

    const close = (result) => {
      backdrop.remove();
      document.removeEventListener("keydown", onKey);
      resolve(result);
    };
    const onKey = (event) => {
      if (event.key === "Escape") close(false);
    };

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop || event.target.closest("[data-close]")) close(false);
      if (event.target.closest("[data-confirm]")) close(true);
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(backdrop);
    backdrop.querySelector("[data-confirm]").focus();
  });
}

/** A modal that renders arbitrary markup and hands back its root node. */
export function openModal(markup, { wide = false, onMount } = {}) {
  const backdrop = document.createElement("div");
  backdrop.className = "bp-modal-backdrop";
  backdrop.innerHTML = `<div class="bp-modal${wide ? " bp-modal--wide" : ""}" role="dialog" aria-modal="true">${markup}</div>`;

  const close = () => {
    backdrop.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (event) => {
    if (event.key === "Escape") close();
  };

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop || event.target.closest("[data-close]")) close();
  });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(backdrop);
  if (onMount) onMount(backdrop.firstElementChild, close);
  return { root: backdrop.firstElementChild, close };
}

export { mount };
