// POST /api/affiliate-signup { name, email, payout_email, website, code }
// Creates an affiliate with a referral code and a private dashboard link.

import { json, esc } from "../../lib/layout.js";
import { loadSettings } from "../../lib/data.js";
import { supabase, sendEmail, randomToken, isEmail, siteOrigin } from "../../lib/services.js";

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400); }
  if (body.company) return json({ ok: true }); // honeypot

  const name = String(body.name || "").trim().slice(0, 80);
  const email = String(body.email || "").trim().toLowerCase();
  const payoutEmail = String(body.payout_email || "").trim().toLowerCase();
  const website = String(body.website || "").trim().slice(0, 200);
  if (!name) return json({ error: "Please enter your name." }, 400);
  if (!isEmail(email)) return json({ error: "Please enter a valid email address." }, 400);
  if (payoutEmail && !isEmail(payoutEmail)) return json({ error: "The PayPal email doesn't look valid." }, 400);
  if (!body.agree) return json({ error: "Please accept the program terms." }, 400);

  let wanted = slugify(body.code || "");
  if (body.code && (wanted.length < 3 || wanted.length > 30)) {
    return json({ error: "Referral codes need 3–30 letters, numbers or dashes." }, 400);
  }

  const origin = siteOrigin(request, env);
  const settings = await loadSettings(env, new URL(request.url).origin);
  const db = supabase(env);

  const [existing] = await db.select("affiliates", `email=eq.${encodeURIComponent(email)}&select=code,token,name`);
  if (existing) {
    await emailLinks(env, origin, settings, email, existing);
    return json({ ok: true, existing: true, message: "You're already registered — we've emailed your dashboard link again." });
  }

  const base = wanted || slugify(name).slice(0, 20) || "partner";
  const token = randomToken();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = attempt === 0 && wanted ? base : `${base}-${randomToken(2)}`;
    try {
      const [aff] = await db.insert("affiliates", [{
        code, name, email, payout_email: payoutEmail || null, website: website || null, token,
      }]);
      await emailLinks(env, origin, settings, email, aff);
      return json({
        ok: true,
        code: aff.code,
        link: `${origin}/?ref=${aff.code}`,
        dashboard: `${origin}/affiliates/dashboard/${aff.token}`,
      });
    } catch (err) {
      if (err.code !== "23505") { // anything except a unique-key clash
        console.log("affiliate signup failed:", err.message);
        return json({ error: "Something went wrong — please try again later." }, 502);
      }
      if (attempt === 0 && wanted) {
        return json({ error: `The code "${wanted}" is taken — please choose another.` }, 409);
      }
    }
  }
  return json({ error: "Couldn't create a unique code — please choose one yourself." }, 409);
}

function slugify(s) {
  return String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function emailLinks(env, origin, settings, to, aff) {
  await sendEmail(env, {
    to,
    subject: "Your DeepStockReport affiliate links",
    replyTo: settings.contactEmail,
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">
      <p>Hi ${esc(aff.name)},</p>
      <p>Your referral link (add <code>?ref=${esc(aff.code)}</code> to any page on the site):<br>
        <a href="${origin}/?ref=${esc(aff.code)}">${origin}/?ref=${esc(aff.code)}</a></p>
      <p>Your private dashboard — clicks, referred orders and commissions. Keep this link to yourself:<br>
        <a href="${origin}/affiliates/dashboard/${esc(aff.token)}">${origin}/affiliates/dashboard/${esc(aff.token)}</a></p>
      <p>You earn ${settings.commissionPercent}% of every paid order you refer. Commissions become payable
        ${settings.holdDays} days after the sale.</p>
    </div>`,
  });
}
