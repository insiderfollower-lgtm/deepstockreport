// Thin fetch() clients for Supabase (PostgREST), Stripe and Resend.
// Secrets come from the Pages project's environment variables:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, STRIPE_SECRET_KEY,
//   STRIPE_WEBHOOK_SECRET, RESEND_API_KEY, EMAIL_FROM, ADMIN_EMAIL

// ---------- Supabase ----------

export function supabase(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    throw new Error("Database is not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY).");
  }
  const base = env.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1";
  const key = env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, "Content-Type": "application/json" };
  // Legacy service_role keys are JWTs and also go in Authorization;
  // the newer sb_secret_ keys must only be sent as apikey.
  if (key.startsWith("eyJ")) headers.Authorization = "Bearer " + key;

  async function call(method, path, body, prefer) {
    const res = await fetch(base + path, {
      method,
      headers: prefer ? { ...headers, Prefer: prefer } : headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = new Error(data?.message || `Supabase ${method} ${path} failed (${res.status})`);
      err.status = res.status;
      err.code = data?.code;
      throw err;
    }
    return data;
  }

  return {
    select: (table, query = "") => call("GET", `/${table}?${query}`),
    insert: (table, rows, { ignoreDuplicates = false, onConflict } = {}) =>
      call(
        "POST",
        `/${table}${onConflict ? `?on_conflict=${onConflict}` : ""}`,
        rows,
        ["return=representation", ignoreDuplicates && "resolution=ignore-duplicates"].filter(Boolean).join(","),
      ),
    update: (table, query, patch) => call("PATCH", `/${table}?${query}`, patch, "return=representation"),
    rpc: (fn, args) => call("POST", `/rpc/${fn}`, args),
  };
}

// ---------- Stripe ----------

export async function stripe(env, method, path, params) {
  if (!env.STRIPE_SECRET_KEY) throw new Error("Payments are not configured yet (missing STRIPE_SECRET_KEY).");
  const res = await fetch((env.STRIPE_API_BASE || "https://api.stripe.com") + path, {
    method,
    headers: {
      Authorization: "Basic " + btoa(env.STRIPE_SECRET_KEY + ":"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params ? params.toString() : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Stripe error on ${path}`);
  return data;
}

// Verifies the Stripe-Signature header (HMAC-SHA256 over "t.payload").
export async function verifyStripeSignature(payload, header, secret, toleranceSec = 300) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=")).filter((p) => p.length === 2 && p[0] === "t"),
  );
  const signatures = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  const t = parseInt(parts.t, 10);
  if (!t || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return signatures.some((s) => timingSafeEqual(s, expected));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- Email (Resend) ----------

// Returns false (and logs) instead of throwing when email isn't set up,
// so a missing key never blocks a paid order from being fulfilled.
export async function sendEmail(env, { to, subject, html, replyTo }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    console.log(`[email skipped: RESEND_API_KEY/EMAIL_FROM not set] to=${to} subject=${subject}`);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html, reply_to: replyTo || undefined }),
  });
  if (!res.ok) {
    console.log(`[email failed ${res.status}] ${await res.text()}`);
    return false;
  }
  return true;
}

// ---------- misc ----------

export function randomToken(bytes = 24) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function isEmail(s) {
  return typeof s === "string" && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function siteOrigin(request, env) {
  return env.SITE_URL ? env.SITE_URL.replace(/\/+$/, "") : new URL(request.url).origin;
}
