// Order fulfillment, shared by the Stripe webhook and the thank-you page.
// It is idempotent: whichever caller marks the order paid first creates the
// download links, the affiliate commission and the emails; later calls just
// read them back.

import { supabase, stripe, sendEmail, randomToken } from "./services.js";
import { esc } from "./layout.js";
import { money } from "./data.js";

export async function fulfillCheckoutSession(env, sessionId, origin, settings) {
  const db = supabase(env);
  const session = await stripe(env, "GET", `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
  const orderId = session.metadata?.order_id;
  if (!orderId) throw new Error("Checkout session has no order id.");

  const [order] = await db.select("orders", `id=eq.${orderId}&select=*`);
  if (!order) throw new Error("Order not found.");
  if (session.payment_status !== "paid") return { order, downloads: [], state: "processing" };

  // Atomic claim: only the first caller flips pending -> paid.
  const claimed = await db.update("orders", `id=eq.${orderId}&status=eq.pending`, {
    status: "paid",
    paid_at: new Date().toISOString(),
    stripe_session_id: session.id,
    payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
    total_cents: session.amount_total,
  });

  if (claimed.length) {
    const paid = claimed[0];
    const expires = new Date(Date.now() + settings.downloadDays * 86400000).toISOString();
    const rows = paid.lines
      .filter((l) => l.type === "catalog")
      .map((l) => ({
        token: randomToken(),
        order_id: paid.id,
        report_id: l.id,
        title: l.name,
        file: l.file,
        expires_at: expires,
        max_downloads: settings.downloadLimit,
      }));
    const downloads = rows.length ? await db.insert("downloads", rows) : [];
    await recordCommission(db, paid, settings);
    await sendOrderEmails(env, paid, downloads, origin, settings);
    return { order: paid, downloads, state: "paid" };
  }

  const [current] = await db.select("orders", `id=eq.${orderId}&select=*`);
  const downloads = await db.select("downloads", `order_id=eq.${orderId}&select=*&order=created_at`);
  return { order: current, downloads, state: current.status };
}

async function recordCommission(db, order, settings) {
  if (!order.affiliate_code) return;
  const [aff] = await db.select("affiliates", `code=eq.${encodeURIComponent(order.affiliate_code)}&status=eq.active&select=code,email`);
  if (!aff) return;
  // No commission on an affiliate's own purchases.
  if (aff.email.toLowerCase() === order.email.toLowerCase()) return;
  await db.insert(
    "commissions",
    [{
      affiliate_code: aff.code,
      order_id: order.id,
      order_total_cents: order.total_cents,
      rate_percent: settings.commissionPercent,
      commission_cents: Math.round((order.total_cents * settings.commissionPercent) / 100),
    }],
    { ignoreDuplicates: true, onConflict: "order_id" },
  );
}

async function sendOrderEmails(env, order, downloads, origin, settings) {
  const custom = order.lines.filter((l) => l.type === "custom");
  const dlList = downloads
    .map((d) => `<li><a href="${origin}/download/${d.token}">${esc(d.title)}</a></li>`)
    .join("");
  const customList = custom
    .map((l) => `<li>${esc(l.ticker)} — ${esc(l.level)}, ${esc(l.language)}${l.notes ? ` (${esc(l.notes)})` : ""}</li>`)
    .join("");

  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1c1a15">
    <p>Thank you for your order (${money(order.total_cents)}).</p>
    ${dlList ? `<p><strong>Your reports are ready to download:</strong></p><ul>${dlList}</ul>
      <p style="color:#55503f;font-size:13px">Each link works for ${settings.downloadDays} days and up to ${settings.downloadLimit} downloads.</p>` : ""}
    ${customList ? `<p><strong>Custom reports we are now generating for you:</strong></p><ul>${customList}</ul>
      <p>We will email each one to this address as soon as it is ready.</p>` : ""}
    <p>You can also reopen your order page any time: <a href="${origin}/thank-you?session_id=${esc(order.stripe_session_id)}">${origin}/thank-you</a></p>
    <p style="color:#8a8271;font-size:12px">Research only — not financial, investment, or trading advice.
      Questions? Reply to this email or write to ${esc(settings.contactEmail)}.</p>
  </div>`;
  await sendEmail(env, {
    to: order.email,
    subject: "Your DeepStockReport order",
    html,
    replyTo: settings.contactEmail,
  });

  const admin = env.ADMIN_EMAIL || settings.contactEmail;
  if (admin) {
    await sendEmail(env, {
      to: admin,
      subject: `New order ${money(order.total_cents)}${custom.length ? ` — ${custom.length} custom to generate` : ""}`,
      html: `<p>Order <code>${order.id}</code> from ${esc(order.email)} — ${money(order.total_cents)}${order.affiliate_code ? `, referred by <b>${esc(order.affiliate_code)}</b>` : ""}.</p>
        <ul>${order.lines.map((l) => `<li>${esc(l.name)} — ${money(l.unit_cents)}${l.type === "custom" ? ` (${esc(l.language)}${l.notes ? `; notes: ${esc(l.notes)}` : ""})` : ""}</li>`).join("")}</ul>`,
    });
  }
}

// Called by the webhook on charge.refunded.
export async function applyRefund(env, charge) {
  const db = supabase(env);
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!pi) return;
  const [order] = await db.select("orders", `payment_intent=eq.${pi}&select=*`);
  if (!order) return;
  const refunded = charge.amount_refunded || 0;
  const full = refunded >= charge.amount;
  await db.update("orders", `id=eq.${order.id}`, { refunded_cents: refunded, status: full ? "refunded" : order.status });
  const [c] = await db.select("commissions", `order_id=eq.${order.id}&select=*`);
  if (c && c.status === "pending") {
    const remaining = Math.max(0, order.total_cents - refunded);
    await db.update("commissions", `id=eq.${c.id}`, full
      ? { status: "void", commission_cents: 0 }
      : { commission_cents: Math.round((remaining * Number(c.rate_percent)) / 100) });
  }
}
