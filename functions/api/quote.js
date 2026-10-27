// POST /api/quote { items } -> priced cart. The cart drawer shows only
// what the server computes, so displayed and charged totals always match.

import { json } from "../../lib/layout.js";
import { loadSettings, loadCatalog, priceCart } from "../../lib/data.js";

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400); }
  const origin = new URL(request.url).origin;
  const settings = await loadSettings(env, origin);
  const catalog = await loadCatalog(env, origin, settings);
  const quote = priceCart(body.items, catalog, settings);
  // Don't expose storage file names to the browser.
  quote.lines = quote.lines.map(({ file, ...rest }) => rest);
  return json(quote);
}
