// Runs on every request.
// 1. Affiliate links: any URL with ?ref=CODE records a click, remembers the
//    code in a cookie, and redirects to the same URL without ?ref.
// 2. Static pages in public/: fills the shared placeholders
//    (<!--@head-->, <!--@header-->, <!--@footer-->, <!--@latest-reports-->)
//    and {{setting_name}} values from data/settings.csv.

import { commonHead, headerHtml, footerHtml, esc, getCookie } from "../lib/layout.js";
import { loadSettings, loadCatalog, formatDate } from "../lib/data.js";
import { supabase } from "../lib/services.js";

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  const ref = url.searchParams.get("ref");
  if (ref !== null && request.method === "GET") return handleReferral(context, url, ref);

  const res = await next();
  const type = res.headers.get("Content-Type") || "";
  if (res.status !== 200 && res.status !== 404) return res;
  if (!type.includes("text/html") || res.headers.get("X-DSR-Rendered")) return res;

  let html = await res.text();
  if (!html.includes("<!--@") && !html.includes("{{")) return new Response(html, res);

  const settings = await loadSettings(env, url.origin);
  html = html
    .replace("<!--@head-->", commonHead())
    .replace("<!--@header-->", headerHtml(url.pathname.replace(/\.html$/, "")))
    .replace("<!--@footer-->", footerHtml(settings.contactEmail));
  if (html.includes("<!--@latest-reports-->")) {
    html = html.replace("<!--@latest-reports-->", latestReports(await loadCatalog(env, url.origin, settings)));
  }
  html = html.replace(/\{\{([a-z0-9_]+)\}\}/g, (m, key) => (key in settings.raw ? esc(settings.raw[key]) : m));

  const headers = new Headers(res.headers);
  headers.delete("Content-Length");
  headers.delete("ETag");
  headers.set("Cache-Control", "public, max-age=300");
  return new Response(html, { status: res.status, headers });
}

async function handleReferral(context, url, ref) {
  const { request, env } = context;
  const code = ref.trim().toLowerCase();
  url.searchParams.delete("ref");
  const headers = new Headers({ Location: url.pathname + url.search + url.hash, "Cache-Control": "no-store" });

  if (/^[a-z0-9-]{2,40}$/.test(code) && getCookie(request, "dsr_ref") !== code) {
    try {
      const valid = await supabase(env).rpc("record_affiliate_click", { p_code: code });
      if (valid === true) {
        const settings = await loadSettings(env, url.origin);
        const secure = url.protocol === "https:" ? "; Secure" : "";
        headers.append(
          "Set-Cookie",
          `dsr_ref=${code}; Max-Age=${Math.round(settings.cookieDays * 86400)}; Path=/; SameSite=Lax${secure}`,
        );
      }
    } catch (err) {
      console.log("referral tracking failed:", err.message);
    }
  }
  return new Response(null, { status: 302, headers });
}

function latestReports(catalog) {
  if (!catalog.length) return '<p class="catalog-note">New reports are added every week — check back soon.</p>';
  return `<div class="catalog-grid">${catalog.slice(0, 5).map((r) => `
      <a class="report-row report-link" href="/reports/${r.id}">
        <span class="ticker-badge">${esc(r.ticker)}</span>
        <span class="rr-company">${esc(r.name)}</span>
        <span class="rr-meta">${formatDate(r.date, "short")}${r.level ? ` · ${esc(r.level)}` : ""}${r.pages ? ` · ${r.pages} pp` : ""}</span>
        <span class="rr-price">$${r.price}</span>
      </a>`).join("")}
    </div>`;
}
