// The demo workspace. Its job is to be honest: the daily rows have to
// add up to the headline figures, because every rate on screen is
// derived from them by the same code that serves live campaigns.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveMetrics } from "../js/core/metrics.js";
import { DEMO_PERFORMANCE, DEMO_BOOK, DEMO_CREATIVES, DEMO_ANGLES, DEMO_PERSONAS } from "../js/data/demo.js";
import { demoAdapter, resetDemo } from "../js/data/demo-adapter.js";

test("the daily rows sum to the advertised headline figures", () => {
  const m = deriveMetrics(DEMO_PERFORMANCE);
  assert.equal(m.impressions, 32286);
  assert.equal(m.clicks, 904);
  assert.equal(m.spendCents, 11000);
  assert.equal(m.conversions, 47);
  assert.equal(m.revenueCents, 47 * DEMO_BOOK.price_cents);

  assert.equal(m.ctr.toFixed(2), "2.80");
  assert.equal(m.conversionRate.toFixed(2), "5.20");
  assert.equal((m.cpa / 100).toFixed(2), "2.34");
  assert.equal(m.roas.toFixed(2), "3.84");
});

test("revenue is consistent with the book's own price", () => {
  // A demo whose revenue doesn't divide by its price would teach an
  // author to distrust the arithmetic everywhere else.
  const m = deriveMetrics(DEMO_PERFORMANCE);
  assert.equal(m.revenueCents % DEMO_BOOK.price_cents, 0);
  assert.equal(m.revenueCents / DEMO_BOOK.price_cents, m.conversions);
});

test("there is a clear winner and a clear failure to talk about", () => {
  const byAd = new Map();
  for (const row of DEMO_PERFORMANCE) {
    if (!byAd.has(row.ad_id)) byAd.set(row.ad_id, []);
    byAd.get(row.ad_id).push(row);
  }
  const metrics = [...byAd.values()].map(deriveMetrics);
  const best = Math.max(...metrics.map((m) => m.roas));
  const zeroConversion = metrics.filter((m) => m.conversions === 0);
  assert.ok(best > 5, "the winning creative should be clearly ahead");
  assert.equal(zeroConversion.length, 1, "exactly one creative should have spent without converting");
});

test("the dataset is complete enough to exercise every view", () => {
  assert.ok(DEMO_PERSONAS.length >= 3);
  assert.ok(DEMO_ANGLES.length >= 10);
  assert.ok(DEMO_CREATIVES.length >= 4);
  assert.ok(DEMO_CREATIVES.every((c) => typeof c.score === "number"));
  // Every scored creative says what kind of score it is.
  assert.ok(DEMO_CREATIVES.every((c) => c.score_detail.kind === "predicted_quality"));
});

test("the adapter answers the routes the app calls", async () => {
  resetDemo();
  const me = await demoAdapter.request("GET", "/api/bb/me");
  assert.equal(me.profile.full_name, "Demo Author");
  assert.equal(me.counts.books, 1);

  const strategy = await demoAdapter.request("GET", `/api/bb/books/${DEMO_BOOK.id}/strategy`);
  assert.ok(strategy.analysis);
  assert.equal(strategy.personas.length, DEMO_PERSONAS.length);

  const analytics = await demoAdapter.request("GET", "/api/bb/analytics?days=30");
  assert.equal(analytics.totals.conversions, 47);
  assert.equal(analytics.creatives.length, DEMO_CREATIVES.length);
});

test("the demo reports no live capabilities", async () => {
  const config = await demoAdapter.request("GET", "/api/bb/config");
  assert.equal(config.capabilities.meta, false);
  assert.equal(config.capabilities.billing, false);
  assert.equal(config.capabilities.database, false);
  assert.equal(config.auth, null);
});

test("Meta, billing and admin refuse rather than simulate", async () => {
  await assert.rejects(
    () => demoAdapter.request("POST", "/api/bb-meta/push", { campaign_id: "x" }),
    (err) => err.code === "demo_mode"
  );
  await assert.rejects(
    () => demoAdapter.request("POST", "/api/bb-billing/checkout", { plan_id: "author" }),
    (err) => err.code === "demo_mode"
  );
  await assert.rejects(
    () => demoAdapter.request("GET", "/api/bb-admin/overview"),
    (err) => err.code === "forbidden"
  );
});

test("demo mutations are real and credits are spent", async () => {
  resetDemo();
  const before = (await demoAdapter.request("GET", "/api/bb/me")).profile.ai_credits;

  const { book } = await demoAdapter.request("POST", "/api/bb/books", { title: "A second book" });
  const { books } = await demoAdapter.request("GET", "/api/bb/books");
  assert.equal(books.length, 2);

  const result = await demoAdapter.request("POST", "/api/bb-ai/analyze", { book_id: book.id });
  assert.ok(result.demo, "every AI answer in the demo is flagged as demo output");
  assert.equal(result.creditsUsed, 10);

  const after = (await demoAdapter.request("GET", "/api/bb/me")).profile.ai_credits;
  assert.equal(after, before - 10);
});

test("resetDemo returns the workspace to its starting state", async () => {
  await demoAdapter.request("POST", "/api/bb/books", { title: "Temporary" });
  resetDemo();
  const { books } = await demoAdapter.request("GET", "/api/bb/books");
  assert.equal(books.length, 1);
  assert.equal(books[0].id, DEMO_BOOK.id);
});
