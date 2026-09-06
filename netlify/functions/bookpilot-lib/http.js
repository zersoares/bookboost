// HTTP plumbing shared by every BookPilot function: origin checks,
// JSON parsing with a size cap, security headers, and a tiny router.

import { env } from "./env.js";
import { AppError, Errors, toResponseBody } from "./errors.js";

const SECURITY_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
};

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, ...extraHeaders },
  });
}

export function errorResponse(err) {
  const status = err instanceof AppError ? err.status : 500;
  if (!(err instanceof AppError)) {
    // Keep the technical detail in the function log only.
    console.error("[bookpilot] unhandled error:", err);
  }
  return json(toResponseBody(err), status);
}

// Which origins may call the API. In production this is the deployed
// site; localhost is allowed so the app can be run with `netlify dev`.
function allowedOrigins() {
  const list = [env.siteUrl, ...env.allowedOrigins].filter(Boolean);
  list.push("http://localhost:8888", "http://localhost:3000", "http://127.0.0.1:8888");
  return list;
}

export function originAllowed(req) {
  const origin = req.headers.get("origin");
  // Same-origin browser requests (and server-to-server callers such as
  // Stripe webhooks) send no Origin header; those are checked by their
  // own signature verification instead.
  if (!origin) return true;
  return allowedOrigins().some((o) => o && origin === o);
}

export function corsHeaders(req) {
  const origin = req.headers.get("origin");
  if (!origin || !originAllowed(req)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Vary": "Origin",
  };
}

const MAX_BODY_BYTES = 512 * 1024; // 512 KB — book descriptions, not manuscripts

export async function readJson(req, maxBytes = MAX_BODY_BYTES) {
  const raw = await req.text();
  if (raw.length > maxBytes) {
    throw Errors.invalid("That request is too large. Please shorten the text and try again.");
  }
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed;
  } catch {
    throw Errors.invalid("We couldn't read that request.");
  }
}

// Split "/api/bp/books/123" (after the given prefix) into ["books","123"].
export function pathSegments(req, prefix) {
  const { pathname } = new URL(req.url);
  const rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname;
  return rest.split("/").filter(Boolean).map(decodeURIComponent);
}

// Minimal method+shape router. Routes are declared as
//   { method: "GET", match: (segs) => …, handler: async (ctx) => … }
export async function route(req, routes, ctx) {
  const segments = ctx.segments;
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const params = r.match(segments);
    if (params) return r.handler({ ...ctx, params });
  }
  throw Errors.notFound("endpoint");
}

// Wraps a handler with the checks every endpoint needs.
export function withGuards(handler) {
  return async (req, context) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }
    if (!originAllowed(req)) {
      return json(toResponseBody(Errors.forbidden()), 403);
    }
    try {
      const res = await handler(req, context);
      const cors = corsHeaders(req);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (err) {
      const res = errorResponse(err);
      const cors = corsHeaders(req);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    }
  };
}
