// The advertising maths. These are the numbers an author decides a
// budget on, so the tests are about the boundaries: zero denominators,
// partial data, and the point at which a result is allowed to be called
// a winner.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ctr, cpc, cpa, cpm, conversionRate, roas, sumRows, deriveMetrics,
  confidenceLevel, budgetRecommendation,
} from "../js/core/metrics.js";

test("rates are null, never zero, when the denominator is zero", () => {
  // An ad with no impressions has an unknown click-through rate, not a
  // bad one — the difference decides whether an author pauses it.
  assert.equal(ctr(0, 0), null);
  assert.equal(ctr(5, 0), null);
  assert.equal(cpc(1000, 0), null);
  assert.equal(cpa(1000, 0), null);
  assert.equal(conversionRate(0, 0), null);
  assert.equal(roas(5000, 0), null);
  assert.equal(cpm(1000, 0), null);
});

test("rates match their definitions", () => {
  assert.equal(ctr(25, 1000), 2.5);
  assert.equal(cpc(1000, 50), 20);
  assert.equal(cpa(1000, 4), 250);
  assert.equal(conversionRate(5, 100), 5);
  assert.equal(roas(4000, 1000), 4);
  assert.equal(cpm(1000, 10000), 100);
});

test("non-numeric input yields null rather than NaN", () => {
  assert.equal(ctr("abc", 100), null);
  assert.equal(roas(undefined, 100), null);
  assert.equal(cpc(100, null), null);
});

test("sumRows accepts both database and camelCase shapes", () => {
  const totals = sumRows([
    { impressions: 100, clicks: 10, spend_cents: 500, conversions: 1, revenue_cents: 900 },
    { impressions: 50, clicks: 5, spendCents: 250, conversions: 1, revenueCents: 900 },
  ]);
  assert.equal(totals.impressions, 150);
  assert.equal(totals.clicks, 15);
  assert.equal(totals.spendCents, 750);
  assert.equal(totals.revenueCents, 1800);
});

test("deriveMetrics reports hasData false for an empty set", () => {
  const m = deriveMetrics([]);
  assert.equal(m.hasData, false);
  assert.equal(m.ctr, null);
  assert.equal(m.roas, null);
});

test("deriveMetrics flags data once anything has been delivered", () => {
  // Spend with no clicks yet still counts as data — the campaign is
  // running, and hiding that would look like nothing happened.
  const m = deriveMetrics([{ impressions: 0, clicks: 0, spend_cents: 120, conversions: 0, revenue_cents: 0 }]);
  assert.equal(m.hasData, true);
  assert.equal(m.ctr, null);
  assert.equal(m.cpc, null);
});

test("confidence rises with evidence, not with the ratio", () => {
  // One sale from twelve clicks is a 4x ROAS and means nothing.
  assert.equal(confidenceLevel({ clicks: 12, conversions: 1, impressions: 300 }), "insufficient");
  assert.equal(confidenceLevel({ clicks: 60, conversions: 2, impressions: 3000 }), "low");
  assert.equal(confidenceLevel({ clicks: 200, conversions: 10, impressions: 9000 }), "medium");
  assert.equal(confidenceLevel({ clicks: 500, conversions: 30, impressions: 20000 }), "high");
});

test("budget recommendation withholds itself without evidence", () => {
  assert.equal(budgetRecommendation({ currentDailyBudgetCents: 1000, metrics: deriveMetrics([]) }), null);
  const thin = deriveMetrics([{ impressions: 200, clicks: 5, spend_cents: 200, conversions: 0, revenue_cents: 0 }]);
  assert.equal(budgetRecommendation({ currentDailyBudgetCents: 1000, metrics: thin }), null);
});

test("a profitable campaign is scaled gradually, never doubled", () => {
  const metrics = deriveMetrics([
    { impressions: 20000, clicks: 500, spend_cents: 10000, conversions: 30, revenue_cents: 40000 },
  ]);
  const rec = budgetRecommendation({ currentDailyBudgetCents: 1000, metrics });
  assert.ok(rec);
  assert.ok(rec.balanced > 1000, "balanced band should be above the current budget");
  // A budget jump restarts Meta's learning phase; even the aggressive
  // band stays under +50%.
  assert.ok(rec.aggressive <= 1500, `aggressive band ${rec.aggressive} should stay within +50%`);
  assert.ok(rec.conservative <= rec.balanced && rec.balanced <= rec.aggressive);
});

test("a loss-making campaign is recommended down, not up", () => {
  const metrics = deriveMetrics([
    { impressions: 30000, clicks: 600, spend_cents: 20000, conversions: 10, revenue_cents: 9000 },
  ]);
  const rec = budgetRecommendation({ currentDailyBudgetCents: 2000, metrics });
  assert.ok(rec);
  assert.ok(rec.balanced < 2000, "balanced band should reduce spend below break-even");
  assert.match(rec.rationale, /below break-even/i);
});
