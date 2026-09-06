// Rate limiting.
//
// Two layers, because neither is sufficient alone:
//
//  1. A per-instance in-memory counter. Free, instant, and catches the
//     common case (one client hammering one warm function instance).
//  2. A database-backed count of AI operations per user per hour, which
//     survives cold starts and covers the expensive path — an attacker
//     who cycles instances still can't run up an Anthropic bill.

import { Errors } from "./errors.js";

const buckets = new Map();

/**
 * @param key    identity to limit on (user id, IP, site key…)
 * @param limit  requests allowed per window
 * @param windowMs window length
 */
export function memoryLimit(key, limit, windowMs) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    }
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    throw Errors.rateLimited(Math.ceil((bucket.reset - now) / 1000));
  }
}

/**
 * Hourly ceiling on AI operations for one account, counted from the
 * ai_usage table so it holds across instances and deploys.
 */
export async function aiHourlyLimit(db, userId, limitPerHour) {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const rows = await db.select("ai_usage", {
    select: "id",
    eq: { user_id: userId },
    filters: { created_at: `gte.${since}` },
    limit: limitPerHour + 1,
  });
  if (rows.length >= limitPerHour) throw Errors.rateLimited(600);
}
