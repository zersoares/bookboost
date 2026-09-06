// Light/dark theme.
//
// Three states: an explicit "light" or "dark" choice stored per browser,
// or no choice at all, in which case the OS setting decides through the
// prefers-color-scheme rules in design-system.css.

const KEY = "bookboost.theme";

function read() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    // Private browsing and blocked site data both throw here; the OS
    // setting is a perfectly good fallback.
    return null;
  }
}

export function applyStoredTheme() {
  const stored = read();
  if (stored === "light" || stored === "dark") {
    document.documentElement.setAttribute("data-theme", stored);
  }
}

export function currentTheme() {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit) return explicit;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* the choice just won't survive a reload */
  }
  return next;
}

export function mountThemeToggle(button) {
  if (!button) return;
  const paint = () => {
    const dark = currentTheme() === "dark";
    button.textContent = dark ? "☀" : "☾";
    button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    button.title = button.getAttribute("aria-label");
  };
  paint();
  button.addEventListener("click", () => {
    toggleTheme();
    paint();
  });
}
