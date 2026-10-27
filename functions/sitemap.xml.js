// /sitemap.xml — static pages plus one URL per catalog report.

import { SITE_URL } from "../lib/layout.js";
import { loadSettings, loadCatalog, todayET } from "../lib/data.js";

const STATIC = ["/", "/how-it-works", "/reports", "/watchlist", "/affiliates", "/disclaimer"];

export async function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin;
  const catalog = await loadCatalog(env, origin, await loadSettings(env, origin));
  const today = todayET();
  const urls = [
    ...STATIC.map((p) => ({ loc: SITE_URL + (p === "/" ? "/" : p), lastmod: today })),
    ...catalog.map((r) => ({ loc: `${SITE_URL}/reports/${r.id}`, lastmod: r.date })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`).join("\n")}
</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
