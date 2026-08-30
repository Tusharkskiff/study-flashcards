/**
 * common.js — shared helpers used by both the public site and admin page.
 */

const Toast = (() => {
  let stack;
  function ensureStack() {
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      document.body.appendChild(stack);
    }
    return stack;
  }
  function show(message, type = "info", timeout = 4500) {
    const s = ensureStack();
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = message;
    s.appendChild(el);
    setTimeout(() => el.remove(), timeout);
  }
  return {
    info: (m) => show(m, "info"),
    success: (m) => show(m, "success"),
    error: (m) => show(m, "error", 7000)
  };
})();

const Theme = (() => {
  const KEY = "sf_theme";
  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(KEY, theme);
  }
  function init() {
    const saved = localStorage.getItem(KEY);
    const preferred = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    apply(preferred);
  }
  function toggle() {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    apply(current === "dark" ? "light" : "dark");
  }
  function current() {
    return document.documentElement.getAttribute("data-theme") || "light";
  }
  return { init, toggle, current };
})();

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function handleApiError(err, fallbackMessage) {
  console.error(err);
  Toast.error(err && err.message ? err.message : (fallbackMessage || "Something went wrong."));
}
