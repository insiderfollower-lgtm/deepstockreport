// /reports/<ticker>-<date> — one landing page per catalog report.

import { page, htmlResponse, esc, SITE_URL } from "../../lib/layout.js";
import { loadSettings, loadCatalog, formatDate, ageLabel, todayET, LEVELS } from "../../lib/data.js";

export async function onRequestGet({ request, env, params }) {
  const origin = new URL(request.url).origin;
  const settings = await loadSettings(env, origin);
  const catalog = await loadCatalog(env, origin, settings);
  const r = catalog.find((c) => c.id === params.slug);

  if (!r) {
    return htmlResponse(page({
      path: `/reports/${params.slug}`,
      title: "Report not found | DeepStockReport",
      description: "This report is no longer in the catalog.",
      noindex: true,
      contactEmail: settings.contactEmail,
      body: `<header class="page-head"><h1>That report is no longer in the catalog</h1>
        <p>It may have been retired. <a href="/reports#catalog">Browse current reports</a> or
        <a href="/reports#request">order a fresh custom run</a> on any ticker.</p></header>`,
    }), 404);
  }

  const others = catalog.filter((c) => c.ticker === r.ticker && c.id !== r.id);
  const dateLong = formatDate(r.date);
  const priceNote = r.tomorrowPrice < r.price
    ? `Drops to $${r.tomorrowPrice} at midnight ET tomorrow, never below $${Math.min(settings.minPrice, r.startPrice)}.`
    : `This is the lowest price this report will reach.`;

  const body = `
        <nav class="crumbs" aria-label="Breadcrumb"><a href="/reports">Reports</a> <span>/</span> <a href="/reports#catalog">Catalog</a> <span>/</span> ${esc(r.ticker)}</nav>
        <div class="report-detail">
          <div>
            <div class="ticker-row">
              <span class="ticker-badge">${esc(r.ticker)}</span>
              ${r.level ? `<span class="level-chip">${esc(r.level)} depth</span>` : ""}
            </div>
            <h1 class="report-title">${esc(r.name)} (${esc(r.ticker)}) stock research report — ${dateLong}</h1>
            <p class="sample-meta">Generated ${dateLong}${r.pages ? ` · ${r.pages} pages` : ""} · PDF · ${ageLabel(r.daysOld)}</p>
            ${r.notes ? `<p class="rr-notes big">${esc(r.notes)}</p>` : ""}
            <h2 class="h-sm">What&rsquo;s inside</h2>
            <ul class="inside-list">
              <li><strong>I. Analyst team</strong> — technical, sentiment, news &amp; macro, and fundamentals reports on ${esc(r.ticker)}</li>
              <li><strong>II. Research debate</strong> — the bull and bear researchers argue it out; the research manager rules</li>
              <li><strong>III. Trading plan</strong> — action, entry, stop and position sizing</li>
              <li><strong>IV. Risk review</strong> — aggressive, conservative and neutral analysts cross-examine the plan</li>
              <li><strong>V. Portfolio manager decision</strong> — final rating, price target where given, and time horizon</li>
            </ul>
            ${r.level ? `<p class="catalog-note"><strong>${esc(r.level)} depth:</strong> ${esc(LEVELS[r.level])}.</p>` : ""}
            <p class="catalog-note">The rating and price target are revealed inside the PDF, not on this page.
              It is a snapshot of the data available on ${dateLong}; verify figures against primary sources.
              See a full example first: <a href="/how-it-works#samples">free sample reports</a>.</p>
          </div>
          <aside class="buy-box">
            <p class="price">$${r.price}<small>${esc(priceNote)}</small></p>
            <button class="btn cart-checkout-btn" type="button" data-add-catalog="${esc(r.id)}">Add to cart</button>
            <p class="foot-small">Instant download after payment; the link is also emailed to you. Bundle discounts apply
              when you buy 2 or more reports.</p>
            <p class="foot-small"><a href="/reports#request">Need fresher data? Order a custom ${esc(r.ticker)} run</a>.</p>
          </aside>
        </div>
        ${others.length ? `<section><div class="sec-head"><h2>Other ${esc(r.ticker)} reports</h2></div>
          <div class="catalog-grid">${others.map((o) => `<a class="report-row report-link" href="/reports/${o.id}">
            <span class="ticker-badge">${esc(o.ticker)}</span><span class="rr-company">${formatDate(o.date)}</span>
            <span class="rr-meta">${o.level ? esc(o.level) : ""}${o.pages ? ` · ${o.pages} pp` : ""}</span><span class="rr-price">$${o.price}</span></a>`).join("")}
          </div></section>` : ""}`;

  const url = `${SITE_URL}/reports/${r.id}`;
  const jsonld = [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: `${r.ticker} stock research report — ${dateLong}`,
      description: `${r.pages ? r.pages + "-page " : ""}multi-agent AI research report on ${r.name} (${r.ticker}), generated ${dateLong}${r.level ? `, ${r.level} research depth` : ""}.`,
      sku: r.id,
      brand: { "@type": "Brand", name: "DeepStockReport" },
      category: "Stock research report",
      url,
      offers: {
        "@type": "Offer",
        price: r.price.toFixed(2),
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        priceValidUntil: todayET(),
        url,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Reports", item: `${SITE_URL}/reports` },
        { "@type": "ListItem", position: 2, name: `${r.ticker} report ${r.date}`, item: url },
      ],
    },
  ];

  return htmlResponse(page({
    path: `/reports/${r.id}`,
    title: `${r.ticker} Stock Analysis Report (${formatDate(r.date, "short")}) — ${r.name} | DeepStockReport`,
    description: `${r.name} (${r.ticker}) AI stock research report generated ${dateLong}: ${r.pages ? r.pages + " pages of " : ""}technical, fundamental, sentiment and news analysis, a bull/bear debate, trading plan and risk review. $${r.price} today.`,
    body,
    jsonld,
    contactEmail: settings.contactEmail,
  }));
}
