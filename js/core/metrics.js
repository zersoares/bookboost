// Advertising maths (spec §44).
//
// Single source of truth: the browser imports this file directly and the
// serverless functions import it through
// netlify/functions/bookpilot-lib/metrics.js, so a dashboard figure and
// an AI Advisor figure can never disagree.
//
// The rule that matters: a rate with a zero denominator is *unknown*,
// not zero. Every function returns null in that case and the UI renders
// "N/A" — a CTR of 0.0% on an ad with no impressions is a lie that
// makes an author pause a creative that never ran.
//
// All money is in minor units (cents) as integers.

export function ratio(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return n / d;
}

/** Click-through rate as a percentage: clicks / impressions × 100. */
export function ctr(clicks, impressions) {
  const r = ratio(clicks, impressions);
  return r === null ? null : r * 100;
}

/** Cost per click, in cents: spend / clicks. */
export function cpc(spendCents, clicks) {
  return ratio(spendCents, clicks);
}

/** Cost per acquisition, in cents: spend / conversions. */
export function cpa(spendCents, conversions) {
  return ratio(spendCents, conversions);
}

/** Conversion rate as a percentage: conversions / clicks × 100. */
export function conversionRate(conversions, clicks) {
  const r = ratio(conversions, clicks);
  return r === null ? null : r * 100;
}

/** Return on ad spend: revenue / spend. */
export function roas(revenueCents, spendCents) {
  return ratio(revenueCents, spendCents);
}

/** Cost per mille, in cents: spend / impressions × 1000. */
export function cpm(spendCents, impressions) {
  const r = ratio(spendCents, impressions);
  return r === null ? null : r * 1000;
}

const ZERO = {
  impressions: 0,
  reach: 0,
  clicks: 0,
  spendCents: 0,
  conversions: 0,
  revenueCents: 0,
  unitsSold: 0,
};

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Add up raw daily rows into one set of totals. Accepts both the
 * database shape (spend_cents, revenue_cents…) and the camelCase shape
 * used inside the app.
 */
export function sumRows(rows = []) {
  return rows.reduce((acc, row) => {
    acc.impressions += toNumber(row.impressions);
    acc.reach += toNumber(row.reach);
    acc.clicks += toNumber(row.clicks);
    acc.spendCents += toNumber(row.spend_cents ?? row.spendCents);
    acc.conversions += toNumber(row.conversions);
    acc.revenueCents += toNumber(row.revenue_cents ?? row.revenueCents);
    acc.unitsSold += toNumber(row.units_sold ?? row.unitsSold);
    return acc;
  }, { ...ZERO });
}

/**
 * Totals plus every derived rate. `hasData` tells the UI whether to show
 * the numbers at all or the "Not enough data yet" empty state (spec §19).
 */
export function deriveMetrics(rows = []) {
  const totals = sumRows(rows);
  return {
    ...totals,
    ctr: ctr(totals.clicks, totals.impressions),
    cpc: cpc(totals.spendCents, totals.clicks),
    cpa: cpa(totals.spendCents, totals.conversions),
    cpm: cpm(totals.spendCents, totals.impressions),
    conversionRate: conversionRate(totals.conversions, totals.clicks),
    roas: roas(totals.revenueCents, totals.spendCents),
    hasData: totals.impressions > 0 || totals.clicks > 0 || totals.spendCents > 0,
  };
}

/**
 * How much evidence a creative has accumulated. Used to decide whether
 * the advisor may call something a winner at all: with 40 clicks and one
 * sale, "3.8× ROAS" is noise, and saying so out loud is the difference
 * between a marketing tool and a slot machine (spec §46).
 */
export function confidenceLevel({ clicks = 0, conversions = 0, impressions = 0 }) {
  if (conversions >= 25 && clicks >= 400) return "high";
  if (conversions >= 8 && clicks >= 150) return "medium";
  if (clicks >= 40 || impressions >= 2000) return "low";
  return "insufficient";
}

/**
 * Budget recommendation (spec §23). Returns three daily-budget bands in
 * cents plus the reasoning, or null when there isn't enough evidence to
 * say anything useful. These are estimates, never promises — the UI
 * prints that alongside them.
 */
export function budgetRecommendation({
  currentDailyBudgetCents = 0,
  metrics,
  targetRoas = 2,
}) {
  if (!metrics || !metrics.hasData) return null;
  const confidence = confidenceLevel(metrics);
  if (confidence === "insufficient") return null;

  const current = Math.max(currentDailyBudgetCents, 100);
  const performing = metrics.roas !== null && metrics.roas >= targetRoas;
  const failing = metrics.roas !== null && metrics.roas < 1;

  // Scale steps are deliberately small. Doubling a budget on a Meta
  // campaign resets its learning phase and usually costs more than it
  // buys, so even the aggressive band stays under +50%.
  let factors;
  if (failing) factors = { conservative: 0.5, balanced: 0.7, aggressive: 1.0 };
  else if (performing) factors = { conservative: 1.1, balanced: 1.25, aggressive: 1.5 };
  else factors = { conservative: 0.9, balanced: 1.0, aggressive: 1.2 };

  const round = (cents) => Math.max(100, Math.round(cents / 100) * 100);
  return {
    confidence,
    currentDailyBudgetCents: current,
    conservative: round(current * factors.conservative),
    balanced: round(current * factors.balanced),
    aggressive: round(current * factors.aggressive),
    rationale: failing
      ? "Return on ad spend is below break-even, so the recommendation is to reduce spend while you test new creatives."
      : performing
        ? "Return on ad spend is above your target. Increasing gradually protects the campaign's learning phase."
        : "Performance is close to break-even. Holding the budget steady while you test new angles is the lower-risk option.",
  };
}
