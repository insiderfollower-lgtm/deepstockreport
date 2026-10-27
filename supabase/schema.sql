-- DeepStockReport database schema.
-- Run once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Row Level Security is enabled with NO policies, so the public anon key can
-- read/write nothing; only the site's server code (service key) has access.

create extension if not exists pgcrypto;

-- Orders: one row per checkout. Created as 'pending' before Stripe, marked
-- 'paid' by the Stripe webhook (or the thank-you page, whichever is first).
create table if not exists orders (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  email             text not null,
  lines             jsonb not null,          -- priced items (catalog + custom)
  subtotal_cents    integer not null,
  discount_cents    integer not null default 0,
  total_cents       integer not null,        -- amount actually charged once paid
  refunded_cents    integer not null default 0,
  status            text not null default 'pending'
                    check (status in ('pending', 'paid', 'refunded')),
  stripe_session_id text unique,
  payment_intent    text,
  paid_at           timestamptz,
  affiliate_code    text,
  has_custom        boolean not null default false,
  custom_delivered_at timestamptz,           -- set this yourself after emailing custom reports
  admin_notes       text
);
create index if not exists orders_payment_intent_idx on orders (payment_intent);

-- One download link per purchased catalog report.
create table if not exists downloads (
  token          text primary key,
  created_at     timestamptz not null default now(),
  order_id       uuid not null references orders(id) on delete cascade,
  report_id      text not null,
  title          text not null,
  file           text not null,              -- object key in the R2 bucket
  expires_at     timestamptz not null,
  max_downloads  integer not null default 10,
  download_count integer not null default 0,
  last_download_at timestamptz
);
create index if not exists downloads_order_idx on downloads (order_id);

-- Watchlist subscription interest list.
create table if not exists watchlist_signups (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  email      text not null unique
);

-- Affiliates. `token` is the secret in their private dashboard link.
create table if not exists affiliates (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  code         text not null unique,
  name         text not null,
  email        text not null unique,
  payout_email text,
  website      text,
  token        text not null unique,
  status       text not null default 'active' check (status in ('active', 'disabled')),
  clicks       integer not null default 0
);

-- One commission per paid referred order.
-- status: pending (inside the refund window / not yet paid out),
--         paid (you paid the affiliate: set paid_at), void (refunded / rejected).
create table if not exists commissions (
  id               bigserial primary key,
  created_at       timestamptz not null default now(),
  affiliate_code   text not null references affiliates(code) on update cascade,
  order_id         uuid not null unique references orders(id) on delete cascade,
  order_total_cents integer not null,
  rate_percent     numeric not null,
  commission_cents integer not null,
  status           text not null default 'pending' check (status in ('pending', 'paid', 'void')),
  paid_at          timestamptz,
  payout_reference text                       -- e.g. PayPal transaction id
);
create index if not exists commissions_affiliate_idx on commissions (affiliate_code);

alter table orders            enable row level security;
alter table downloads         enable row level security;
alter table watchlist_signups enable row level security;
alter table affiliates        enable row level security;
alter table commissions       enable row level security;

-- Counts a referral-link click; returns true if the code is an active affiliate.
create or replace function record_affiliate_click(p_code text)
returns boolean language sql security definer set search_path = public as $$
  with u as (
    update affiliates set clicks = clicks + 1
    where code = lower(p_code) and status = 'active'
    returning 1
  )
  select exists (select 1 from u);
$$;
revoke execute on function record_affiliate_click(text) from public, anon, authenticated;
grant execute on function record_affiliate_click(text) to service_role;

-- Atomically uses one download; returns the row only if still allowed.
create or replace function use_download(p_token text)
returns setof downloads language sql security definer set search_path = public as $$
  update downloads d
     set download_count = d.download_count + 1, last_download_at = now()
   where d.token = p_token
     and d.expires_at > now()
     and d.download_count < d.max_downloads
     and exists (select 1 from orders o where o.id = d.order_id and o.status = 'paid')
  returning d.*;
$$;
revoke execute on function use_download(text) from public, anon, authenticated;
grant execute on function use_download(text) to service_role;

-- Handy view for paying affiliates: commissions past the refund window.
-- Change '30 days' if you change affiliate_hold_days in settings.csv.
create or replace view affiliate_payouts_due with (security_invoker = true) as
  select a.code, a.name, a.email, coalesce(a.payout_email, a.email) as pay_to,
         count(*) as orders, sum(c.commission_cents) / 100.0 as amount_usd
    from commissions c join affiliates a on a.code = c.affiliate_code
   where c.status = 'pending' and c.created_at < now() - interval '30 days'
   group by a.code, a.name, a.email, a.payout_email;
