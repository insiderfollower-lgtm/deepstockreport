// POST /api/watchlist { email } — joins the watchlist-subscription interest list.

import { json } from "../../lib/layout.js";
import { supabase, isEmail } from "../../lib/services.js";

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400); }
  if (body.dsr_hp) return json({ ok: true }); // honeypot field filled in: a bot
  const email = String(body.email || "").trim().toLowerCase();
  if (!isEmail(email)) return json({ error: "Please enter a valid email address." }, 400);
  try {
    await supabase(env).insert("watchlist_signups", [{ email }], { ignoreDuplicates: true, onConflict: "email" });
  } catch (err) {
    console.log("watchlist signup failed:", err.message);
    return json({ error: "Something went wrong — please try again later." }, 500);
  }
  return json({ ok: true, message: "You're on the list. We'll email you when watchlist subscriptions open." });
}
