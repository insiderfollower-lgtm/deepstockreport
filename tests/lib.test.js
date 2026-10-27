import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { parseCsv, catalogPrice, priceCart, addDays } from "../lib/data.js";
import { verifyStripeSignature } from "../lib/services.js";

const settings = {
  prices: { Shallow: 29, Medium: 39, Deep: 49 }, dailyDrop: 1, minPrice: 3,
  bundle: [{ min: 5, percent: 30 }, { min: 3, percent: 20 }, { min: 2, percent: 10 }],
};

test("CSV handles quotes, commas, BOM, CRLF and non-English notes", () => {
  const rows = parseCsv('\uFEFFticker,name,notes\r\nAMZN,"Amazon.com, Inc.","报告 ""中文"""\r\n\r\n');
  assert.deepEqual(rows, [{ ticker: "AMZN", name: "Amazon.com, Inc.", notes: '报告 "中文"' }]);
});

test("catalog price drops $1/day and stops at the floor", () => {
  assert.equal(catalogPrice(15, 0, settings), 15);
  assert.equal(catalogPrice(15, 5, settings), 10);
  assert.equal(catalogPrice(15, 12, settings), 3);
  assert.equal(catalogPrice(15, 400, settings), 3);
  assert.equal(catalogPrice(2, 10, settings), 2); // a start price under the floor is kept
});

test("addDays crosses month ends", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
});

test("cart pricing ignores client prices and applies bundle tiers", () => {
  const catalog = [{ id: "nvda-2026-10-19", ticker: "NVDA", name: "NVIDIA", date: "2026-10-19", price: 7, level: "Deep", pages: 70, file: "x.pdf" }];
  const q = priceCart([
    { type: "catalog", id: "nvda-2026-10-19", price: 0.01, key: "a" },
    { type: "catalog", id: "nvda-2026-10-19", key: "dup" },
    { type: "custom", ticker: "aapl", language: "Chinese", level: "Medium", key: "b" },
    { type: "custom", ticker: "MSFT", language: "Klingon", level: "Medium", key: "c" },
    { type: "catalog", id: "gone", key: "d" },
  ], catalog, settings);
  assert.equal(q.lines.length, 2);
  assert.equal(q.subtotal_cents, 700 + 3900);
  assert.equal(q.discount_percent, 10);
  assert.equal(q.total_cents, 4600 - 460);
  assert.deepEqual(q.problems.map((p) => p.key), ["c", "d"]);
});

test("Stripe signature verification", async () => {
  const secret = "whsec_test", body = '{"id":"evt_1"}', t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  assert.equal(await verifyStripeSignature(body, `t=${t},v1=${sig}`, secret), true);
  assert.equal(await verifyStripeSignature(body + " ", `t=${t},v1=${sig}`, secret), false);
  assert.equal(await verifyStripeSignature(body, `t=${t - 3600},v1=${sig}`, secret), false);
});
