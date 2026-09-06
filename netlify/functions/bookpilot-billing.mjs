// BookPilot AI — billing.
//
//   /api/bp-billing/*
//
// Checkout and the customer portal. Plan state is never set from here:
// it is set by the webhook after Stripe confirms payment, so a user who
// closes the checkout tab at the right moment does not end up on a plan
// they didn't pay for.

import { withGuards, json, readJson, pathSegments } from "./bookpilot-lib/http.js";
import { authenticate } from "./bookpilot-lib/auth.js";
import { dbAsService } from "./bookpilot-lib/db.js";
import { Errors } from "./bookpilot-lib/errors.js";
import { env } from "./bookpilot-lib/env.js";
import { memoryLimit } from "./bookpilot-lib/ratelimit.js";
import * as stripe from "./bookpilot-lib/stripe.js";
import * as v from "./bookpilot-lib/validate.js";

const PREFIX = "/api/bp-billing";

async function startCheckout(ctx, body) {
  if (!stripe.configured()) throw Errors.notConfigured("Billing");

  const planId = v.str(body.plan_id, "Plan", { max: 40, required: true });
  const plan = await dbAsService().selectOne("plans", { eq: { id: planId, is_active: true } });
  if (!plan) throw Errors.notFound("plan");
  if (!plan.stripe_price_id) {
    throw Errors.notConfigured(`The ${plan.name} plan's price`);
  }
  if (plan.price_cents === 0) throw Errors.invalid("The free plan doesn't need checkout.");

  const subscription = await ctx.db.selectOne("subscriptions", { eq: { user_id: ctx.user.id } });
  const appUrl = `${env.siteUrl.replace(/\/$/, "")}/app.html`;

  const session = await stripe.createCheckoutSession({
    mode: "subscription",
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    success_url: `${appUrl}#/billing?checkout=success`,
    cancel_url: `${appUrl}#/billing?checkout=cancelled`,
    client_reference_id: ctx.user.id,
    ...(subscription?.stripe_customer_id
      ? { customer: subscription.stripe_customer_id }
      : { customer_email: ctx.profile.email || ctx.user.email }),
    // The webhook reads these back — it is the only place the plan is
    // applied, and it must not have to guess who paid.
    subscription_data: { metadata: { user_id: ctx.user.id, plan_id: plan.id } },
    metadata: { user_id: ctx.user.id, plan_id: plan.id },
  });

  return json({ url: session.url });
}

async function openPortal(ctx) {
  if (!stripe.configured()) throw Errors.notConfigured("Billing");
  const subscription = await ctx.db.selectOne("subscriptions", { eq: { user_id: ctx.user.id } });
  if (!subscription?.stripe_customer_id) {
    throw Errors.invalid("There's no billing account to manage yet.");
  }
  const session = await stripe.createPortalSession({
    customer: subscription.stripe_customer_id,
    return_url: `${env.siteUrl.replace(/\/$/, "")}/app.html#/billing`,
  });
  return json({ url: session.url });
}

async function summary(ctx) {
  const [subscription, plans, usage] = await Promise.all([
    ctx.db.selectOne("subscriptions", { eq: { user_id: ctx.user.id } }),
    dbAsService().select("plans", { select: "*", eq: { is_active: true }, order: "sort_order" }),
    ctx.db.select("ai_usage", {
      select: "operation,credits_used,created_at",
      eq: { user_id: ctx.user.id },
      order: "created_at.desc",
      limit: 50,
    }),
  ]);
  return json({
    subscription,
    plans,
    credits: ctx.profile.ai_credits,
    planId: ctx.profile.plan_id,
    recentUsage: usage,
    billingAvailable: stripe.configured(),
  });
}

export default withGuards(async (req) => {
  const [action] = pathSegments(req, PREFIX);
  const ctx = await authenticate(req);
  memoryLimit(`billing:${ctx.user.id}`, 30, 60_000);

  if (req.method === "GET" && (action === "summary" || !action)) return summary(ctx);
  if (req.method === "POST" && action === "checkout") return startCheckout(ctx, await readJson(req));
  if (req.method === "POST" && action === "portal") return openPortal(ctx);

  throw Errors.notFound("endpoint");
});

export const config = { path: "/api/bp-billing/*" };
