// /thank-you?session_id=... — Stripe returns the buyer here. Confirms the
// payment with Stripe directly (so downloads work even if the webhook is
// slow) and lists the download links.

import { page, htmlResponse, esc } from "../lib/layout.js";
import { loadSettings, money } from "../lib/data.js";
import { fulfillCheckoutSession } from "../lib/orders.js";
import { siteOrigin } from "../lib/services.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const settings = await loadSettings(env, url.origin);
  const sessionId = url.searchParams.get("session_id") || "";
  const render = (body, status = 200) =>
    htmlResponse(page({
      path: "/thank-you",
      title: "Your order | DeepStockReport",
      description: "Your DeepStockReport order.",
      noindex: true,
      body,
      contactEmail: settings.contactEmail,
    }), status, { "Cache-Control": "no-store" });

  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    return render(`<header class="page-head"><h1>Order not found</h1>
      <p>Open the link from your order email, or write to <a href="mailto:${esc(settings.contactEmail)}">${esc(settings.contactEmail)}</a>.</p></header>`, 404);
  }

  let result;
  try {
    result = await fulfillCheckoutSession(env, sessionId, siteOrigin(request, env), settings);
  } catch (err) {
    console.log("thank-you failed:", err.message);
    return render(`<header class="page-head"><h1>We couldn&rsquo;t load your order</h1>
      <p>If you were charged, don&rsquo;t worry — your order is saved and we&rsquo;ll email your reports.
      Questions: <a href="mailto:${esc(settings.contactEmail)}">${esc(settings.contactEmail)}</a>.</p></header>`, 500);
  }

  const { order, downloads, state } = result;
  if (state === "processing") {
    return render(`<header class="page-head"><h1>Payment processing…</h1>
      <p>Stripe hasn&rsquo;t confirmed your payment yet. This page will update — <a href="">refresh</a> in a minute.
      We&rsquo;ll also email your download links to ${esc(order.email)}.</p></header>`);
  }
  if (state === "refunded") {
    return render(`<header class="page-head"><h1>This order was refunded</h1>
      <p>Download links for refunded orders are disabled.</p></header>`);
  }

  const custom = order.lines.filter((l) => l.type === "custom");
  const body = `
        <header class="page-head">
          <p class="kicker">Order confirmed</p>
          <h1>Thank you — your order is paid</h1>
          <p>Total charged ${money(order.total_cents)}. A copy of this page was emailed to <strong>${esc(order.email)}</strong>.</p>
        </header>
        <div data-clear-cart></div>
        ${downloads.length ? `<section><div class="sec-head"><h2>Download your reports</h2>
          <p>Each link works for ${settings.downloadDays} days and up to ${settings.downloadLimit} downloads.</p></div>
          <div class="catalog-grid">${downloads.map((d) => `<div class="report-row">
            <span class="rr-company">${esc(d.title)}</span>
            <span class="rr-meta">${d.download_count}/${d.max_downloads} downloads used</span>
            <a class="btn small" href="/download/${esc(d.token)}">Download PDF</a></div>`).join("")}
          </div></section>` : ""}
        ${custom.length ? `<section><div class="sec-head"><h2>Custom reports in progress</h2>
          <p>We&rsquo;re generating these now and will email each PDF to ${esc(order.email)} when it&rsquo;s ready.</p></div>
          <div class="catalog-grid">${custom.map((l) => `<div class="report-row">
            <span class="ticker-badge">${esc(l.ticker)}</span>
            <span class="rr-company">${esc(l.level)} depth · ${esc(l.language)}</span>
            ${l.notes ? `<span class="rr-meta">${esc(l.notes)}</span>` : ""}</div>`).join("")}
          </div></section>` : ""}
        <p class="catalog-note">Questions? <a href="mailto:${esc(settings.contactEmail)}">${esc(settings.contactEmail)}</a></p>`;
  return render(body);
}
