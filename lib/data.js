// Loads the two hand-edited data files (public/data/catalog.csv and
// public/data/settings.csv) and holds all pricing rules, so the pages,
// the cart quote and Stripe checkout always agree on a price.

export const LANGUAGES = [
  "English", "Chinese", "Japanese", "Korean", "Hindi", "Spanish",
  "Portuguese", "French", "German", "Arabic", "Russian",
];

export const LEVELS = {
  Shallow: "One round of bull/bear debate and risk discussion — a faster, essential pass",
  Medium: "Three rounds of debate and risk discussion — the full desk, argued out",
  Deep: "Five rounds of debate and risk discussion — the deepest dive",
};

const TIME_ZONE = "America/New_York";

// ---------- CSV ----------

// RFC 4180 parser: quoted fields, "" escapes, commas/newlines in quotes,
// CRLF or LF line endings, and the BOM Excel adds to "CSV UTF-8" files.
export function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ""));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map((h) => h.trim().toLowerCase());
  return nonEmpty.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = (r[i] ?? "").trim(); });
    return obj;
  });
}

async function fetchAsset(env, origin, path) {
  const res = await env.ASSETS.fetch(new Request(new URL(path, origin)));
  if (!res.ok) throw new Error(`Missing data file ${path} (${res.status})`);
  return res.text();
}

// ---------- settings ----------

export async function loadSettings(env, origin) {
  const rows = parseCsv(await fetchAsset(env, origin, "/data/settings.csv"));
  const s = {};
  for (const r of rows) if (r.setting) s[r.setting] = r.value;
  const num = (k, d) => (Number.isFinite(parseFloat(s[k])) ? parseFloat(s[k]) : d);
  return {
    raw: s,
    prices: { Shallow: num("price_shallow", 29), Medium: num("price_medium", 39), Deep: num("price_deep", 49) },
    dailyDrop: num("catalog_daily_drop", 1),
    minPrice: num("catalog_min_price", 3),
    bundle: [
      { min: 5, percent: num("bundle_5_percent", 30) },
      { min: 3, percent: num("bundle_3_percent", 20) },
      { min: 2, percent: num("bundle_2_percent", 10) },
    ],
    freePerWeek: num("watchlist_free_reports_per_week", 3),
    commissionPercent: num("affiliate_commission_percent", 30),
    cookieDays: num("affiliate_cookie_days", 180),
    holdDays: num("affiliate_hold_days", 30),
    downloadDays: num("download_link_days", 30),
    downloadLimit: num("download_limit", 10),
    contactEmail: s.contact_email || "deepstockreport@gmail.com",
  };
}

// ---------- dates (US Eastern) ----------

export function todayET() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function dayNumber(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

export function addDays(iso, n) {
  return new Date((dayNumber(iso) + n) * 86400000).toISOString().slice(0, 10);
}

export function formatDate(iso, style = "long") {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC", month: style, day: "numeric", year: "numeric",
  });
}

// ---------- catalog ----------

export async function loadCatalog(env, origin, settings) {
  const rows = parseCsv(await fetchAsset(env, origin, "/data/catalog.csv"));
  const today = todayET();
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const ticker = (r.ticker || "").toUpperCase();
    if (!ticker || !/^\d{4}-\d{2}-\d{2}$/.test(r.date || "") || !r.file) continue;
    const level = LEVELS[cap(r.level)] ? cap(r.level) : "";
    let slug = `${ticker.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${r.date}`;
    if (seen.has(slug) && level) slug += `-${level.toLowerCase()}`;
    const base = slug;
    for (let n = 2; seen.has(slug); n++) slug = `${base}-v${n}`;
    seen.add(slug);
    const startPrice = parseFloat(r.price) || 15;
    const item = {
      id: slug,
      ticker,
      name: r.name || ticker,
      date: r.date,
      pages: parseInt(r.pages, 10) || null,
      level,
      notes: r.notes || "",
      file: r.file,
      startPrice,
    };
    item.daysOld = Math.max(0, dayNumber(today) - dayNumber(r.date));
    item.price = catalogPrice(startPrice, item.daysOld, settings);
    item.tomorrowPrice = catalogPrice(startPrice, item.daysOld + 1, settings);
    out.push(item);
  }
  // Newest first; ties by ticker.
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.ticker.localeCompare(b.ticker)));
  return out;
}

export function catalogPrice(startPrice, daysOld, settings) {
  const floor = Math.min(startPrice, settings.minPrice);
  return Math.max(floor, startPrice - settings.dailyDrop * daysOld);
}

function cap(s) {
  s = (s || "").trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- cart pricing (the only place an order total is computed) ----------

export function bundlePercent(count, settings) {
  for (const tier of settings.bundle) if (count >= tier.min) return tier.percent;
  return 0;
}

// items: [{type:"catalog", id}] or [{type:"custom", ticker, language, level, notes}]
export function priceCart(items, catalog, settings) {
  const lines = [];
  const problems = [];
  const seenCatalog = new Set();
  for (const it of (Array.isArray(items) ? items : []).slice(0, 25)) {
    if (it && it.type === "catalog") {
      const r = catalog.find((c) => c.id === it.id);
      if (!r) { problems.push({ key: it.key, error: "This report is no longer available." }); continue; }
      if (seenCatalog.has(r.id)) continue;
      seenCatalog.add(r.id);
      lines.push({
        key: it.key, type: "catalog", id: r.id, file: r.file,
        name: `${r.ticker} report — ${formatDate(r.date, "short")}`,
        detail: [r.name, r.level && `${r.level} depth`, r.pages && `${r.pages} pages`].filter(Boolean).join(" · "),
        unit_cents: Math.round(r.price * 100),
      });
    } else if (it && it.type === "custom") {
      const ticker = String(it.ticker || "").trim().toUpperCase();
      const level = LEVELS[it.level] ? it.level : null;
      const language = LANGUAGES.includes(it.language) ? it.language : null;
      if (!/^[A-Z0-9][A-Z0-9.\-:]{0,14}$/.test(ticker) || !level || !language) {
        problems.push({ key: it.key, error: "Invalid custom report request." });
        continue;
      }
      const notes = String(it.notes || "").slice(0, 500);
      lines.push({
        key: it.key, type: "custom", ticker, level, language, notes,
        name: `Custom ${ticker} report — ${level}`,
        detail: `${language} · generated after payment, delivered by email`,
        unit_cents: Math.round(settings.prices[level] * 100),
      });
    }
  }
  const subtotal = lines.reduce((s, l) => s + l.unit_cents, 0);
  const percent = bundlePercent(lines.length, settings);
  const discount = Math.round((subtotal * percent) / 100);
  return { lines, problems, subtotal_cents: subtotal, discount_percent: percent, discount_cents: discount, total_cents: subtotal - discount };
}

export function money(cents) {
  return "$" + (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

export function ageLabel(d) {
  return d === 0 ? "new today" : d === 1 ? "1 day old" : `${d} days old`;
}
