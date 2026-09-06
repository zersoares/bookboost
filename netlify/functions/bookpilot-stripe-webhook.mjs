// BookPilot AI — Stripe webhook.
//
//   /api/bp-stripe-webhook
//
// The only place a paid plan is granted. Requests are rejected unless
// they carry a valid Stripe signature, so the endpoint being public
// doesn't make plans free.

import { json } from "./bookpilot-lib/http.js";
import { dbAsService } from "./bookpilot-lib/db.js";
import * as stripe from "./bookpilot-lib/stripe.js";
import * as audit from "./bookpilot-lib/audit.js";

async function applyPlan(userId, planId, subscription) {
  const service = dbAsService();
  await service.upsert(
    "subscriptions",
    {
      user_id: userId,
      plan_id: planId,
      status: subscription?.status || "active",
      stripe_customer_id: subscription?.customer || null,
      stripe_subscription_id: subscription?.id || null,
      current_period_end: subscription?.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: Boolean(subscription?.cancel_at_period_end),
    },
    { onConflict: "user_id", returning: false }
  );
  await service.rpc("bb_apply_plan", { p_user: userId, p_plan: planId });
  await service.insert(
    "notifications",
    {
      user_id: userId,
      type: "billing",
      title: "Subscription updated",
      message: `Your plan is now ${planId.replace("_", " ")}.`,
      link: "#/billing",
    },
    { returning: false }
  );
  await audit.record(userId, "billing.plan_applied", { entity: "subscription", detail: { planId } });
}

async function downgrade(userId, reason) {
  const service = dbAsService();
  await service.update("subscriptions", { status: reason }, { eq: { user_id: userId } });
  await service.rpc("bb_apply_plan", { p_user: userId, p_plan: "free" });
  await service.insert(
    "notifications",
    {
      user_id: userId,
      type: "payment_issue",
      title: reason === "past_due" ? "Payment issue" : "Subscription ended",
      message:
        reason === "past_due"
          ? "We couldn't take your last payment. Update your card to keep your plan."
          : "Your subscription has ended and your account is back on the Free plan.",
      link: "#/billing",
    },
    { returning: false }
  );
  await audit.record(userId, "billing.downgraded", { detail: { reason } });
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: { message: "Method not allowed" } }, 405);

  const raw = await req.text();
  const signature = req.headers.get("stripe-signature");

  let valid = false;
  try {
    valid = await stripe.verifyWebhook(raw, signature);
  } catch (err) {
    console.error("[bookpilot] webhook not configured:", err.message);
    return json({ error: { message: "Not configured" } }, 501);
  }
  if (!valid) {
    console.warn("[bookpilot] rejected Stripe webhook with bad signature");
    return json({ error: { message: "Invalid signature" } }, 400);
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: { message: "Invalid payload" } }, 400);
  }

  try {
    const object = event.data?.object || {};
    const userId = object.metadata?.user_id || object.client_reference_id;
    const planId = object.metadata?.plan_id;

    switch (event.type) {
      case "checkout.session.completed": {
        if (!userId || !planId) break;
        const subscription = object.subscription
          ? await stripe.getSubscription(object.subscription)
          : null;
        await applyPlan(userId, planId, { ...subscription, customer: object.customer });
        break;
      }
      case "customer.subscription.updated": {
        if (!userId) break;
        if (object.status === "active" || object.status === "trialing") {
          await applyPlan(userId, planId || "author", object);
        } else if (object.status === "past_due" || object.status === "unpaid") {
          await downgrade(userId, "past_due");
        }
        break;
      }
      case "customer.subscription.deleted": {
        if (userId) await downgrade(userId, "cancelled");
        break;
      }
      case "invoice.payment_failed": {
        const id = object.subscription_details?.metadata?.user_id;
        if (id) await downgrade(id, "past_due");
        break;
      }
      default:
        break;
    }
  } catch (err) {
    // Returning 500 makes Stripe retry, which is what we want for a
    // transient database failure.
    console.error("[bookpilot] webhook handling failed:", event.type, err);
    return json({ received: false }, 500);
  }

  return json({ received: true });
};

export const config = { path: "/api/bp-stripe-webhook" };
