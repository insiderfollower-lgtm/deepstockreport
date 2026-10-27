# DeepStockReport — website

Multi-page site for www.deepstockreport.com on **Cloudflare Pages**, deployed from GitHub.
Plain HTML/CSS/JS, no build step. Server logic is in Pages Functions (`functions/`).

| Page | URL | Source |
|---|---|---|
| Home | `/` | `public/index.html` |
| How it works + free TSLA/MSFT samples | `/how-it-works` | `public/how-it-works.html` |
| Reports & pricing + catalog + custom request form | `/reports` | `functions/reports/index.js` |
| One SEO page per catalog report | `/reports/nvda-2026-10-19` | `functions/reports/[slug].js` |
| Watchlist interest sign-up | `/watchlist` | `public/watchlist.html` |
| Affiliate program + sign-up | `/affiliates` | `public/affiliates.html` |
| Affiliate private dashboard | `/affiliates/dashboard/<token>` | `functions/affiliates/dashboard/[token].js` |
| Disclaimer | `/disclaimer` | `public/disclaimer.html` |
| Order page after Stripe | `/thank-you` | `functions/thank-you.js` |
| Paid PDF download | `/download/<token>` | `functions/download/[token].js` |
| Sitemap | `/sitemap.xml` | `functions/sitemap.xml.js` |

---

## Everyday tasks

### Add a ready-made report to the catalog
1. Upload the PDF to the R2 bucket **deepstockreport-reports**: Cloudflare dashboard → R2 → bucket → *Upload*.
2. Add one line to `public/data/catalog.csv`, then commit and push. Cloudflare redeploys in about a minute.

```
ticker,name,date,pages,level,price,file,notes
TSLA,"Tesla, Inc.",2026-10-26,78,Medium,15,TSLA_20261026.pdf,Q3 earnings + SpaceX merger odds
```

- `date` uses the format YYYY-MM-DD.
- `level` is Shallow, Medium or Deep.
- `price` is the starting price on `date`. It drops by `catalog_daily_drop` every day at midnight US Eastern time, and never goes below `catalog_min_price`.
- `file` must match the file name in R2 exactly, including upper and lower case.
- `notes` is shown publicly and can be in any language. Never put the rating or price target in it.
- Put quotes around any value that contains a comma.
- If you edit the file in Excel, save it as **CSV UTF-8**. Plain "CSV" breaks non-English notes.
- To retire a report, delete its line. People who already bought it keep their download links.

You can edit the CSV directly on github.com with the pencil icon. No local tools needed.

### Change prices, discounts, commission and similar values
Edit `public/data/settings.csv`, then commit and push. Every page, the cart and Stripe checkout read it:
custom report prices (29/39/49), catalog price drop and floor, bundle discounts, free watchlist reports per week,
affiliate rate, cookie length and hold period, how long download links last, and the contact email.

### Deliver a custom report
After a paid order you get an email listing what to generate. Run the report, then email the PDF to the customer.
Then go to Supabase → Table Editor → `orders` and set `custom_delivered_at` on that order (this is optional; it's for your own tracking).

### Pay affiliates (monthly)
1. Supabase → SQL Editor: `select * from affiliate_payouts_due;` lists who is owed what, past the 30-day refund window.
2. Pay each affiliate by PayPal.
3. In the `commissions` table, set `status = paid`, `paid_at`, and `payout_reference` (the PayPal transaction id) on the rows you paid.
   Affiliates see this on their dashboard right away.

Refunds that you issue in Stripe void the commission automatically and disable that order's download links.

---

## One-time setup

### 1. GitHub
Create a **private** repo and push this folder (`webpages/deepstockreport`) as the repo root.
The `deepstockreport-r2-upload/` folder next to it holds the paid PDFs. Never commit it.

### 2. Cloudflare Pages: switch the project to Git
Pages projects created with "Upload assets" can't be connected to Git afterwards. So:
1. Workers & Pages → *Create* → Pages → *Connect to Git* → pick the repo.
2. Build command: *(leave empty)*. Build output directory: `public`.
3. Once it deploys, open the new project → *Custom domains*. Move `www.deepstockreport.com` (and `deepstockreport.com`) from the
   old project to this one, then delete the old project.
4. To make `deepstockreport.com` redirect to `www`, go to your zone → Rules → *Redirect Rules* →
   "Redirect from root to WWW" template.

### 3. R2 bucket (free tier: 10 GB storage, no egress fees)
1. R2 → *Create bucket* → name it `deepstockreport-reports`. Keep public access **off**.
   R2 may ask you to add a payment method once, even on the free tier.
2. Upload the four existing catalog PDFs from `../deepstockreport-r2-upload/`.
3. The `REPORTS` binding is declared in `wrangler.toml`, which Pages reads on every deploy, so there's nothing to set up in the dashboard.
   Because of this, bindings and plain variables are managed in that file. Secrets (step 7) still go in the dashboard.

### 4. Supabase (free tier)
1. Create a project, then go to SQL Editor → paste `supabase/schema.sql` → *Run*.
2. Go to Project Settings → API keys and copy the **secret** key (`sb_secret_…`, or the legacy `service_role` key) and the project URL.
3. Free projects pause after about a week with no traffic. Once the site has regular visitors this won't happen.

### 5. Stripe
1. Developers → Webhooks → *Add endpoint* `https://www.deepstockreport.com/api/stripe-webhook`
   with events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`.
   Copy its signing secret (`whsec_…`).
2. Use the test keys first, then swap in the live keys after you've done a test purchase.

### 6. Email (Resend, free: 3,000 emails/month)
1. Sign up at resend.com → *Domains* → add `deepstockreport.com` and add the DNS records it shows (in Cloudflare DNS).
2. Create an API key.
3. Until this is set up, orders still work: buyers download from the thank-you page. Only the emails are skipped.

### 7. Pages environment variables
Pages project → Settings → Variables and Secrets → Production. Add these as **Secrets**:

| Name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` and later `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | `sb_secret_…` |
| `RESEND_API_KEY` | `re_…` |

`SITE_URL`, `EMAIL_FROM` and `ADMIN_EMAIL` are set in `wrangler.toml`. Edit them there if needed.
`EMAIL_FROM` must use the domain you verified in Resend. Redeploy after changing variables.

### 8. Search engines
Add the site in Google Search Console and Bing Webmaster Tools, then submit `https://www.deepstockreport.com/sitemap.xml`.

---

## Local testing
```bash
npm install
cp .dev.vars.example .dev.vars   # fill in test keys
npm run dev                      # http://localhost:8788
npm test                         # pricing / CSV / webhook-signature unit tests
```
To test downloads locally, put a PDF into the local R2 simulator:
`npx wrangler r2 object put deepstockreport-reports/NVDA_20261019.pdf --file ../deepstockreport-r2-upload/NVDA_20261019.pdf --local`

## How the pieces fit
- **Prices are computed only on the server** (`lib/data.js`), from the two CSV files. The cart asks `/api/quote`, and checkout
  recomputes the total, so a buyer can't change what they pay.
- **Paid PDFs never sit in the public site.** They live in private R2 and are served only through `/download/<token>`.
  Each link expires (30 days) and has a download limit (10).
- **Fulfillment** (`lib/orders.js`) runs from both the Stripe webhook and the thank-you page. Whichever runs first marks the
  order paid, creates the download links and the commission, and sends the emails. The other one just reads the result.
- **Affiliates**: `?ref=code` on any URL sets a cookie (180 days by default, last click wins). Checkout stores the code on the
  order, and the payment confirmation creates a commission for 30% of what was actually paid. Self-referrals are ignored.
- Static pages use the placeholders `<!--@header-->`, `<!--@footer-->`, `<!--@head-->` and `{{setting_name}}`.
  `functions/_middleware.js` fills them in, so the header and footer live in one place: `lib/layout.js`.
