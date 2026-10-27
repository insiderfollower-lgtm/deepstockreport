// /download/<token> — streams a purchased catalog PDF from the private R2
// bucket (binding REPORTS). Links expire and have a download limit.

import { page, htmlResponse, esc } from "../../lib/layout.js";
import { loadSettings } from "../../lib/data.js";
import { supabase } from "../../lib/services.js";

export async function onRequestGet({ request, env, params }) {
  const settings = await loadSettings(env, new URL(request.url).origin);
  const fail = (title, msg, status) =>
    htmlResponse(page({
      path: "/download",
      title: `${title} | DeepStockReport`,
      description: title,
      noindex: true,
      contactEmail: settings.contactEmail,
      body: `<header class="page-head"><h1>${title}</h1><p>${msg} Need help? Write to
        <a href="mailto:${esc(settings.contactEmail)}">${esc(settings.contactEmail)}</a> with your order email.</p></header>`,
    }), status, { "Cache-Control": "no-store" });

  if (!/^[a-f0-9]{48}$/.test(params.token)) return fail("Download link not found", "Check that you copied the whole link.", 404);

  const db = supabase(env);
  const used = await db.rpc("use_download", { p_token: params.token });
  if (!used.length) {
    const [d] = await db.select("downloads", `token=eq.${params.token}&select=expires_at,download_count,max_downloads`);
    if (!d) return fail("Download link not found", "Check that you copied the whole link.", 404);
    if (new Date(d.expires_at) <= new Date()) return fail("This download link has expired", "", 410);
    if (d.download_count >= d.max_downloads) return fail("Download limit reached", "", 410);
    return fail("This download is not available", "The order may have been refunded.", 403);
  }

  const d = used[0];
  const obj = env.REPORTS ? await env.REPORTS.get(d.file) : null;
  if (!obj) {
    console.log(`R2 object missing: ${d.file}`);
    return fail("File temporarily unavailable", "We've been notified and will email you the report.", 503);
  }
  const filename = d.file.split("/").pop();
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
