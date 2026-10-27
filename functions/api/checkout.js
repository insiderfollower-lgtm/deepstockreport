// POST /api/checkout { email, items } -> { url } of a Stripe Checkout page.
// Prices are recomputed here from the CSV files; whatever the browser sent
// as a price is ignored.

import { json, getCookie } from "../../lib/layout.js";
import { loadSettings, loadCatalog, priceCart } from "../../lib/data.js";
import { supabase, stripe, isEmail } from "../../lib/services.js";

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400); }

  const email = String(body.email || "").trim();
  if (!isEmail(email)) return json({ error: "A valid delivery email is required to check out." }, 400);

  const origin = new URL(request.url).origin;
  const settings = await loadSettings(env, origin);
  const catalog = await loadCatalog(env, origin, settings);
  const quote = priceCart(body.items, catalog, settings);
  if (quote.problems.length) return json({ error: quote.problems[0].error, quote }, 409);
  if (!quote.lines.length) return json({ error: "Your cart is empty." }, 400);

  const ref = getCookie(request, "dsr_ref");
  const affiliateCode = ref && /^[a-z0-9-]{2,40}$/.test(ref) ? ref : null;

  try {
    const db = supabase(env);
    const [order] = await db.insert("orders", [{
      email,
      lines: quote.lines.map(({ key, ...l }) => l),
      subtotal_cents: quote.subtotal_cents,
      discount_cents: quote.discount_cents,
      total_cents: quote.total_cents,
      affiliate_code: affiliateCode,
      has_custom: quote.lines.some((l) => l.type === "custom"),
    }]);

    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("success_url", `${origin}/thank-you?session_id={CHECKOUT_SESSION_ID}`);
    params.set("cancel_url", `${origin}/reports?canceled=1`);
    params.set("customer_email", email);
    params.set("client_reference_id", order.id);
    params.set("metadata[order_id]", order.id);
    params.set("payment_intent_data[metadata][order_id]", order.id);
    if (affiliateCode) params.set("metadata[affiliate]", affiliateCode);
    quote.lines.forEach((l, i) => {
      params.set(`line_items[${i}][quantity]`, "1");
      params.set(`line_items[${i}][price_data][currency]`, "usd");
      params.set(`line_items[${i}][price_data][unit_amount]`, String(l.unit_cents));
      params.set(`line_items[${i}][price_data][product_data][name]`, l.name);
      params.set(`line_items[${i}][price_data][product_data][description]`, l.detail);
    });
    if (quote.discount_cents > 0) {
      const coupon = await stripe(env, "POST", "/v1/coupons", new URLSearchParams({
        amount_off: String(quote.discount_cents),
        currency: "usd",
        duration: "once",
        max_redemptions: "1",
        name: `Bundle discount ${quote.discount_percent}%`,
      }));
      params.set("discounts[0][coupon]", coupon.id);
    }

    const session = await stripe(env, "POST", "/v1/checkout/sessions", params);
    await db.update("orders", `id=eq.${order.id}`, { stripe_session_id: session.id });
    return json({ url: session.url });
  } catch (err) {
    console.log("checkout failed:", err.message);
    return json({ error: String(err.message || err) }, 502);
  }
}
