// POST /api/stripe-webhook — Stripe calls this after payments and refunds.
// Stripe dashboard -> Developers -> Webhooks -> Add endpoint:
//   URL    https://www.deepstockreport.com/api/stripe-webhook
//   Events checkout.session.completed, checkout.session.async_payment_succeeded, charge.refunded
// Put the endpoint's signing secret in STRIPE_WEBHOOK_SECRET.

import { json } from "../../lib/layout.js";
import { loadSettings } from "../../lib/data.js";
import { verifyStripeSignature, siteOrigin } from "../../lib/services.js";
import { fulfillCheckoutSession, applyRefund } from "../../lib/orders.js";

export async function onRequestPost({ request, env }) {
  const payload = await request.text();
  const ok = await verifyStripeSignature(payload, request.headers.get("Stripe-Signature"), env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return json({ error: "Invalid signature." }, 400);

  const event = JSON.parse(payload);
  const origin = siteOrigin(request, env);
  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const settings = await loadSettings(env, origin);
      await fulfillCheckoutSession(env, event.data.object.id, origin, settings);
    } else if (event.type === "charge.refunded") {
      await applyRefund(env, event.data.object);
    }
  } catch (err) {
    console.log(`webhook ${event.type} failed:`, err.message);
    // 500 makes Stripe retry later.
    return json({ error: err.message }, 500);
  }
  return json({ received: true });
}
