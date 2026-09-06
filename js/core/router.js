// Hash router.
//
// Hash routing (#/books/123) rather than the History API on purpose:
// the app is served as a static file from a plain host, so there is no
// server rewrite to make /books/123 resolve. A hash needs no
// hosting configuration and no redirect rules to maintain.

const routes = [];
let notFound = null;
let current = null;
let onNavigate = null;

/** register("/books/:id", handler) */
export function register(pattern, handler) {
  const names = [];
  const regex = new RegExp(
    `^${pattern
      .replace(/\/+$/, "")
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/:(\w+)/g, (_, name) => {
        names.push(name);
        return "([^/]+)";
      })}/?$`
  );
  routes.push({ regex, names, handler, pattern });
}

export function setNotFound(handler) {
  notFound = handler;
}

export function setNavigateHook(fn) {
  onNavigate = fn;
}

export function currentPath() {
  const hash = location.hash.replace(/^#/, "");
  return hash.startsWith("/") ? hash : "/overview";
}

export function navigate(path, { replace = false } = {}) {
  const target = path.startsWith("#") ? path : `#${path}`;
  if (replace) history.replaceState(null, "", target);
  else location.hash = target;
  if (replace) resolve();
}

export function resolve() {
  const full = currentPath();
  const [path, queryString] = full.split("?");
  const query = new URLSearchParams(queryString || "");

  for (const route of routes) {
    const match = route.regex.exec(path);
    if (!match) continue;
    const params = {};
    route.names.forEach((name, index) => {
      params[name] = decodeURIComponent(match[index + 1]);
    });
    current = { path, pattern: route.pattern, params, query };
    if (onNavigate) onNavigate(current);
    route.handler(params, query);
    return;
  }

  current = { path, pattern: null, params: {}, query };
  if (onNavigate) onNavigate(current);
  if (notFound) notFound(path);
}

export function currentRoute() {
  return current;
}

export function start() {
  window.addEventListener("hashchange", () => {
    window.scrollTo(0, 0);
    resolve();
  });

  // Clicking a link that points at the hash already in the address bar
  // fires no hashchange, so the view would never re-render. That is not
  // a no-op from the user's side: "New campaign" pressed while sitting
  // on the finished wizard, or a sidebar item pressed to get back to the
  // top of a list, should both start the view again.
  document.addEventListener("click", (event) => {
    const link = event.target.closest?.('a[href^="#/"]');
    if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) return;
    if (link.getAttribute("href") !== location.hash) return;
    event.preventDefault();
    window.scrollTo(0, 0);
    resolve();
  });

  resolve();
}
