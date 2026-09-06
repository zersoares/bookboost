// Resolving the caller.
//
// The browser holds a Supabase session and sends its access token as a
// bearer token. Rather than verifying the JWT signature here (which
// would mean handling the project's JWT secret in yet another place),
// the token is exchanged for a user at Supabase's own /auth/v1/user
// endpoint — the same token is then reused for every database call, so
// RLS decides what the request can see.

import { env } from "./env.js";
import { Errors } from "./errors.js";
import { dbAsUser, dbAsService } from "./db.js";

export function bearerToken(req) {
  const header = req.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : "";
}

// Small cache so a burst of calls in one page load doesn't hit the auth
// endpoint repeatedly. Keyed by token, 60 s, per warm function instance.
const userCache = new Map();
const USER_TTL_MS = 60_000;

export async function resolveUser(token) {
  if (!token) throw Errors.unauthorized();
  const cached = userCache.get(token);
  if (cached && cached.expires > Date.now()) return cached.user;

  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw Errors.notConfigured("Authentication");
  }

  let res;
  try {
    res = await fetch(`${env.supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { apikey: env.supabaseAnonKey, Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.error("[bookboost] auth service unreachable:", err);
    throw Errors.internal();
  }
  if (!res.ok) throw Errors.unauthorized();

  const body = await res.json();
  if (!body?.id) throw Errors.unauthorized();
  const user = { id: body.id, email: body.email || "" };

  if (userCache.size > 500) userCache.clear();
  userCache.set(token, { user, expires: Date.now() + USER_TTL_MS });
  return user;
}

// Everything a handler needs: the user, an RLS-scoped db client, and
// their profile (plan, credits, role).
export async function authenticate(req) {
  const token = bearerToken(req);
  const user = await resolveUser(token);
  const db = dbAsUser(token);
  const profile = await db.selectOne("profiles", { eq: { id: user.id } });
  if (!profile) throw Errors.unauthorized();
  if (profile.deleted_at) {
    throw Errors.forbidden();
  }
  return { user, db, profile, token };
}

export async function requireAdmin(ctx) {
  if (ctx.profile?.role !== "admin") throw Errors.forbidden();
  // Admin views read across accounts, which RLS deliberately forbids for
  // the user's own token, so those queries use the service role.
  return dbAsService();
}
