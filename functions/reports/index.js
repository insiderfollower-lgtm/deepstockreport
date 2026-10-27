// /reports — catalog (from data/catalog.csv), the three ways to get a
// report, and the custom-report request form.

import { page, htmlResponse, esc, SITE_URL } from "../../lib/layout.js";
import { loadSettings, loadCatalog, formatDate, ageLabel, LANGUAGES, LEVELS } from "../../lib/data.js";

export async function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin;
  const settings = await loadSettings(env, origin);
  const catalog = await loadCatalog(env, origin, settings);
  const p = settings.prices;
  const fromPrice = catalog.length ? Math.min(...catalog.map((r) => r.price)) : settings.minPrice;
  const [b5, b3, b2] = settings.bundle.map((t) => t.percent);

  const rows = catalog.map((r) => `
          <div class="report-row">
            <a class="ticker-badge" href="/reports/${r.id}">${esc(r.ticker)}</a>
            <a class="rr-company" href="/reports/${r.id}">${esc(r.name)}</a>
            <span class="rr-meta">${formatDate(r.date)}${r.pages ? ` · ${r.pages} pages` : ""}${r.level ? ` · <span class="level-chip">${esc(r.level)}</span>` : ""} · ${ageLabel(r.daysOld)}</span>
            ${r.notes ? `<p class="rr-notes">${esc(r.notes)}</p>` : ""}
            <span class="rr-price">$${r.price}</span>
            <button class="btn small" type="button" data-add-catalog="${esc(r.id)}">Add to cart</button>
          </div>`).join("");

  const body = `
        <header class="page-head">
          <p class="kicker">Reports &amp; pricing</p>
          <h1>AI stock research reports — ready-made or run on demand</h1>
          <p>Every report runs the stock through the same five-stage virtual trading desk: four analysts, a bull/bear
            debate, a trading plan, a risk review and a portfolio manager&rsquo;s final call. Buy one off the shelf today,
            or order a fresh run on any ticker.</p>
        </header>

        <section id="offers" aria-labelledby="ways-h">
          <div class="sec-head"><h2 id="ways-h">Three ways to get a report</h2></div>
          <div class="offers">
            <article class="offer">
              <p class="tag">Read today</p>
              <h3>Ready-made catalog</h3>
              <p>Reports already generated and on the shelf — no waiting for a run.</p>
              <ul>
                <li>Download right after payment</li>
                <li>Price drops $${settings.dailyDrop} every day after the report date</li>
                <li>Never below $${settings.minPrice}</li>
              </ul>
              <div class="spacer"></div>
              <p class="status">From $${fromPrice} &middot; ${catalog.length} report${catalog.length === 1 ? "" : "s"} available</p>
              <a class="btn small" href="#catalog">Browse the catalog</a>
            </article>
            <article class="offer featured">
              <p class="tag">Most requested</p>
              <h3>Custom report — your stock</h3>
              <p>Pick any listed ticker and we run the full desk on it for you, on fresh data.</p>
              <ul>
                <li>Any US-listed stock or major global name</li>
                <li>Research depth: Shallow, Medium, or Deep</li>
                <li>11 report languages</li>
                <li>Delivered by email as a complete PDF</li>
              </ul>
              <div class="spacer"></div>
              <p class="status">Shallow $${p.Shallow} &middot; Medium $${p.Medium} &middot; Deep $${p.Deep}</p>
              <a class="btn small" href="#request">Order a custom report</a>
            </article>
            <article class="offer">
              <p class="tag">Coming soon</p>
              <h3>Watchlist subscription</h3>
              <p>Paid subscribers will get ${settings.freePerWeek} reports every week on the tickers they follow, included in the plan.</p>
              <ul>
                <li>Reports on your own watchlist</li>
                <li>Refreshed ratings as new data arrives</li>
                <li>Pricing &amp; details coming soon</li>
              </ul>
              <div class="spacer"></div>
              <p class="status">Free to join the interest list</p>
              <a class="btn small ghost" href="/watchlist">Register interest</a>
            </article>
          </div>
          <p class="discount-strip"><span><strong>Bundle discount:</strong> ${b2}% off 2 paid reports, ${b3}% off 3&ndash;4, ${b5}% off 5 or more —
            catalog and custom reports count together, applied automatically.</span></p>
        </section>

        <section id="catalog" aria-labelledby="catalog-h">
          <div class="sec-head">
            <p class="kicker">Report catalog</p>
            <h2 id="catalog-h">Ready-made reports — buy and read today</h2>
            <p>Each listing shows the ticker, generation date and depth only. The rating, price target and full reasoning
              are inside the PDF. Each report is a snapshot of the data available on its date — newer reports cost more,
              older ones get cheaper every day.</p>
          </div>
          <div class="catalog-grid">${rows || '<p class="catalog-note" style="padding:18px">No ready-made reports right now — order a custom one below.</p>'}
          </div>
          <p class="catalog-note">Want to see the quality first? Read the free
            <a href="/how-it-works#samples">TSLA (Medium) and MSFT (Shallow) sample reports</a>.</p>
        </section>

        <section id="request" aria-labelledby="request-h">
          <div class="request-grid">
            <div class="request-copy">
              <p class="kicker">Request a report</p>
              <h2 id="request-h">Want a detailed report on your stock?</h2>
              <p>Tell us the ticker, pick a language and a research depth, and add it to your cart. You can check out
                together with catalog reports, and the bundle discount applies to the whole cart. Custom runs start
                once payment clears and are delivered to your email.</p>
              <ul>
                <li><strong>Any ticker</strong> — large-cap to small-cap, as long as market data is available.</li>
                <li><strong>Any of 11 languages</strong> — written natively, not a translated summary.</li>
                ${Object.entries(LEVELS).map(([k, v]) => `<li><strong>${k} ($${p[k]})</strong> — ${esc(v)}.</li>`).join("\n                ")}
              </ul>
            </div>
            <form class="req" id="customForm" novalidate>
              <div class="field">
                <label for="reqTicker">Ticker symbol *</label>
                <input id="reqTicker" name="ticker" required maxlength="15" autocomplete="off" placeholder="e.g. AAPL" style="text-transform:uppercase" />
              </div>
              <div class="form-row">
                <div class="field">
                  <label for="reqLang">Report language</label>
                  <select id="reqLang" name="language">${LANGUAGES.map((l) => `<option>${l}</option>`).join("")}</select>
                </div>
                <div class="field">
                  <label for="reqLevel">Research depth</label>
                  <select id="reqLevel" name="level">${Object.keys(LEVELS).map((k) => `<option value="${k}"${k === "Medium" ? " selected" : ""}>${k} — $${p[k]}</option>`).join("")}</select>
                </div>
              </div>
              <div class="field">
                <label for="reqNotes">Anything else? (specific questions, focus areas…)</label>
                <textarea id="reqNotes" name="notes" rows="3" maxlength="500"></textarea>
              </div>
              <button class="btn" type="submit">Add to cart</button>
              <p class="form-msg" id="customMsg" role="status"></p>
            </form>
          </div>
        </section>

        <p class="pipeline-note"><strong>Research only.</strong> Every report is designed for research purposes with a
          long-term horizon. Nothing here — and nothing in any report — is financial, investment, or trading advice.
          <a href="/disclaimer">Full disclaimer</a>.</p>`;

  const jsonld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "DeepStockReport catalog",
    itemListElement: catalog.map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/reports/${r.id}`,
      name: `${r.ticker} stock research report (${r.date})`,
    })),
  };

  return htmlResponse(page({
    path: "/reports",
    title: "Stock Research Reports & Pricing — AI Multi-Agent Analysis | DeepStockReport",
    description: `Buy ready-made AI stock research reports from $${fromPrice}${catalog.length ? ` (${catalog.slice(0, 4).map((r) => r.ticker).join(", ")} and more)` : ""} or order a custom report on any ticker — Shallow $${p.Shallow}, Medium $${p.Medium}, Deep $${p.Deep}, in 11 languages.`,
    body,
    jsonld,
    contactEmail: settings.contactEmail,
  }));
}
