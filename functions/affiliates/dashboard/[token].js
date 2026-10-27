// /affiliates/dashboard/<token> — an affiliate's private stats page.
// Every commission row comes from a Stripe-confirmed payment.

import { page, htmlResponse, esc } from "../../../lib/layout.js";
import { loadSettings, money } from "../../../lib/data.js";
import { supabase, siteOrigin } from "../../../lib/services.js";

export async function onRequestGet({ request, env, params }) {
  const settings = await loadSettings(env, new URL(request.url).origin);
  const render = (body, status = 200) =>
    htmlResponse(page({
      path: "/affiliates/dashboard",
      title: "Affiliate dashboard | DeepStockReport",
      description: "Affiliate dashboard",
      noindex: true,
      body,
      contactEmail: settings.contactEmail,
    }), status, { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });

  if (!/^[a-f0-9]{48}$/.test(params.token)) return render(notFound(), 404);
  const db = supabase(env);
  const [aff] = await db.select("affiliates", `token=eq.${params.token}&select=code,name,clicks,status,created_at,payout_email,email`);
  if (!aff) return render(notFound(), 404);

  const rows = await db.select(
    "commissions",
    `affiliate_code=eq.${encodeURIComponent(aff.code)}&select=created_at,order_total_cents,rate_percent,commission_cents,status,paid_at,payout_reference&order=created_at.desc`,
  );
  const holdMs = settings.holdDays * 86400000;
  const now = Date.now();
  const statusOf = (c) =>
    c.status === "paid" ? "Paid" : c.status === "void" ? "Refunded" : now - new Date(c.created_at) >= holdMs ? "Payable" : "Pending";
  const sum = (label) => rows.filter((c) => statusOf(c) === label).reduce((s, c) => s + c.commission_cents, 0);
  const counted = rows.filter((c) => c.status !== "void");
  const sales = counted.reduce((s, c) => s + c.order_total_cents, 0);
  const link = `${siteOrigin(request, env)}/?ref=${aff.code}`;

  const body = `
        <header class="page-head">
          <p class="kicker">Affiliate dashboard</p>
          <h1>Hi ${esc(aff.name)}</h1>
          <p>Code <span class="mono">${esc(aff.code)}</span>${aff.status !== "active" ? " — <strong>this account is disabled</strong>" : ""}.
            Payouts go to ${esc(aff.payout_email || aff.email)}.</p>
        </header>
        <div class="copy-box">
          <label for="refLink">Your referral link — or add <span class="mono">?ref=${esc(aff.code)}</span> to any page URL</label>
          <div class="copy-row"><input id="refLink" readonly value="${esc(link)}" /><button class="btn small" type="button" data-copy="#refLink">Copy</button></div>
        </div>
        <div class="hero-stats">
          <div><p class="num">${aff.clicks}</p><p class="lbl">Link clicks</p></div>
          <div><p class="num">${counted.length}</p><p class="lbl">Paid orders · ${money(sales)} sales</p></div>
          <div><p class="num">${money(sum("Pending") + sum("Payable"))}</p><p class="lbl">Unpaid commission (${money(sum("Payable"))} payable now)</p></div>
          <div><p class="num">${money(sum("Paid"))}</p><p class="lbl">Paid to you so far</p></div>
        </div>
        <section>
          <div class="sec-head"><h2>Referred orders</h2>
            <p>Each row is created automatically when Stripe confirms a payment from someone who arrived through your link.
              Commissions are <strong>Pending</strong> for ${settings.holdDays} days (refund window), then
              <strong>Payable</strong>; refunded orders show as <strong>Refunded</strong> and earn nothing.</p></div>
          ${rows.length ? `<div class="table-wrap"><table class="data">
            <thead><tr><th>Date</th><th>Order paid</th><th>Rate</th><th>Commission</th><th>Status</th></tr></thead>
            <tbody>${rows.map((c) => `<tr>
              <td>${new Date(c.created_at).toISOString().slice(0, 10)}</td>
              <td>${money(c.order_total_cents)}</td>
              <td>${Number(c.rate_percent)}%</td>
              <td>${money(c.commission_cents)}</td>
              <td><span class="st st-${statusOf(c).toLowerCase()}">${statusOf(c)}</span>${c.paid_at ? ` <span class="rr-meta">${c.paid_at.slice(0, 10)}${c.payout_reference ? " · " + esc(c.payout_reference) : ""}</span>` : ""}</td>
            </tr>`).join("")}</tbody></table></div>` : `<p class="catalog-note">No referred orders yet — share your link to get started.</p>`}
        </section>
        <p class="catalog-note">Bookmark this page; it&rsquo;s private to you. Questions about a payout:
          <a href="mailto:${esc(settings.contactEmail)}">${esc(settings.contactEmail)}</a>.</p>`;
  return render(body);
}

function notFound() {
  return `<header class="page-head"><h1>Dashboard not found</h1>
    <p>Use the link from your welcome email, or <a href="/affiliates#join">sign up again with the same email</a> to have it re-sent.</p></header>`;
}
