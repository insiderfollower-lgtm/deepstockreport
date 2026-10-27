// Shared page chrome. Static pages in public/ use the placeholders
// <!--@head-->, <!--@header-->, <!--@footer--> (filled in by
// functions/_middleware.js); pages rendered by Functions call page().

export const SITE_URL = "https://www.deepstockreport.com";
export const SITE_NAME = "DeepStockReport";

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const NAV = [
  ["/how-it-works", "How it works"],
  ["/reports", "Reports & pricing"],
  ["/watchlist", "Watchlist"],
  ["/affiliates", "Affiliates"],
];

// Common <head> tags (fonts, stylesheet, social defaults). Page-specific
// <title>, description and canonical are written by each page.
export function commonHead() {
  return `<meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="light dark" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta name="twitter:card" content="summary" />
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/assets/site.css?v=2" />
    <script src="/assets/site.js?v=2" defer></script>`;
}

export function headerHtml(path) {
  const links = NAV.map(([href, label]) => {
    const current = path === href || path.startsWith(href + "/");
    return `<a href="${href}"${current ? ' aria-current="page"' : ""}>${esc(label)}</a>`;
  }).join("\n          ");
  return `<div class="topbar">
      <div class="wrap topbar-inner">
        <a class="brand" href="/">
          <span class="brand-name">DeepStockReport</span>
          <span class="brand-tag">deepstockreport.com</span>
        </a>
        <nav class="mainnav" aria-label="Main">
          ${links}
          <a href="/reports#request" class="nav-cta">Request a report</a>
        </nav>
        <button class="btn small cart-btn" type="button" id="cartOpenBtn" aria-haspopup="dialog" aria-controls="cartDrawer">
          Cart <span class="cart-count" id="cartCount">0</span>
        </button>
      </div>
    </div>`;
}

export function footerHtml(contactEmail = "deepstockreport@gmail.com") {
  const year = new Date().getUTCFullYear();
  return `<footer class="site">
      <div class="wrap">
        <div class="foot-row">
          <strong class="brand-name">DeepStockReport</strong>
          <div class="foot-links">
            <a href="/how-it-works">How it works</a>
            <a href="/reports">Reports &amp; pricing</a>
            <a href="/watchlist">Watchlist</a>
            <a href="/affiliates">Affiliate program</a>
            <a href="/disclaimer">Disclaimer &amp; licensing</a>
            <a href="mailto:${esc(contactEmail)}">${esc(contactEmail)}</a>
          </div>
        </div>
        <p class="foot-small">
          &copy; ${year} DeepStockReport (deepstockreport.com). Reports are produced by a multi-agent AI framework for
          research purposes only and are not financial, investment, or trading advice. Each report is written for a
          long-term research horizon. AI-generated analysis can contain errors; verify figures against primary sources.
        </p>
      </div>
    </footer>

    <div class="cart-overlay" id="cartOverlay"></div>
    <aside class="cart-drawer" id="cartDrawer" role="dialog" aria-modal="true" aria-labelledby="cartTitle" aria-hidden="true">
      <div class="cart-head">
        <h2 id="cartTitle">Your cart</h2>
        <button class="cart-close" type="button" id="cartCloseBtn" aria-label="Close cart">&times;</button>
      </div>
      <div class="cart-body">
        <p class="cart-discount-note" id="cartBundleNote">Bundle discount applied automatically — catalog and custom reports count together.</p>
        <div id="cartItems"></div>
        <div class="cart-totals" id="cartTotals"></div>
        <form class="cart-checkout" id="cartCheckout" novalidate>
          <label for="cartEmail">Email for delivery *</label>
          <input type="email" id="cartEmail" name="email" autocomplete="email" required placeholder="you@example.com" />
          <button class="btn cart-checkout-btn" type="submit" id="cartCheckoutBtn">Check out</button>
          <p class="form-msg" id="cartMsg" role="status"></p>
          <p class="foot-small">
            Checkout takes you to Stripe&rsquo;s secure payment page — card details never touch this site.
            Ready-made reports can be downloaded right after payment (the link is emailed too); custom reports are
            generated after payment and delivered by email.
          </p>
        </form>
      </div>
    </aside>`;
}

// Full HTML document for pages rendered by Functions.
export function page({ path, title, description, body, jsonld, noindex, contactEmail }) {
  const canonical = SITE_URL + path;
  const ld = (Array.isArray(jsonld) ? jsonld : jsonld ? [jsonld] : [])
    .map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`)
    .join("\n    ");
  return `<!doctype html>
<html lang="en">
  <head>
    ${commonHead()}
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    ${noindex ? '<meta name="robots" content="noindex, nofollow" />' : `<link rel="canonical" href="${canonical}" />`}
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${canonical}" />
    ${ld}
  </head>
  <body>
    ${headerHtml(path)}
    <main id="top">
      <div class="wrap">
${body}
      </div>
    </main>
    ${footerHtml(contactEmail)}
  </body>
</html>`;
}

export function htmlResponse(html, status = 200, extraHeaders = {}) {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-DSR-Rendered": "1",
      "Cache-Control": "public, max-age=300",
      ...extraHeaders,
    },
  });
}

export function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extraHeaders },
  });
}

export function getCookie(request, name) {
  const m = (request.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}
