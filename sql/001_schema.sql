-- =====================================================================
-- BookBoost AI — schema (Supabase / PostgreSQL)
--
-- Apply in order: 001_schema.sql, 002_rls.sql, 003_seed.sql.
-- Everything lives in the `public` schema and hangs off Supabase's
-- `auth.users`. Row Level Security is switched on for every table in
-- 002_rls.sql — this file only creates structure.
--
-- Money is stored in minor units (cents) as integers. Never floats:
-- ad spend and revenue feed ROAS, and binary fractions there produce
-- reports that don't reconcile.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Reference data (readable by everyone signed in, writable by admins)
-- ---------------------------------------------------------------------

-- Subscription plans. Prices are configurable from the admin panel
-- (spec §29) rather than hard-coded in the client.
create table if not exists public.plans (
  id                text primary key,              -- 'free' | 'author' | 'author_pro' | 'publisher'
  name              text not null,
  price_cents       integer not null default 0,
  currency          text   not null default 'EUR',
  billing_interval  text   not null default 'month',
  book_limit        integer,                       -- null = unlimited
  creative_limit    integer,                       -- null = unlimited, per month
  monthly_credits   integer not null default 0,
  team_seats        integer not null default 1,
  features          jsonb  not null default '[]'::jsonb,
  stripe_price_id   text,
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- What each AI operation costs in credits (spec §30). Admin-editable.
create table if not exists public.credit_costs (
  operation   text primary key,                    -- 'book_analysis', 'image', ...
  label       text not null,
  credits     integer not null check (credits >= 0),
  is_active   boolean not null default true,
  updated_at  timestamptz not null default now()
);

-- Server-side AI prompt registry (spec §38). Prompts are never shipped
-- to the browser; the API layer loads them from here and falls back to
-- the bundled defaults in netlify/functions/bookboost-lib/prompts.js.
create table if not exists public.ai_prompts (
  key            text primary key,                 -- 'book_analysis', 'reader_personas', ...
  label          text not null,
  system_prompt  text not null,
  user_template  text not null,                    -- {{variable}} placeholders
  model          text not null default 'claude-opus-5',
  effort         text not null default 'high',     -- low | medium | high | xhigh | max
  max_tokens     integer not null default 8000,
  json_schema    jsonb,                            -- structured-output schema
  version        integer not null default 1,
  is_active      boolean not null default true,
  updated_at     timestamptz not null default now()
);

create table if not exists public.feature_flags (
  key          text primary key,
  enabled      boolean not null default false,
  description  text,
  updated_at   timestamptz not null default now()
);

-- Small key/value store for admin-tunable system settings.
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------

-- Publisher/agency accounts (spec §29 Publisher plan, §47 phase 4).
-- A book may belong to an organization; every member of that
-- organization can then work on it.
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null default 'member' check (role in ('owner','admin','member')),
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- One row per signed-up user. Created automatically by the trigger at
-- the bottom of this file so a profile always exists after signup.
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text,
  full_name          text,
  country            text,
  currency           text not null default 'EUR',
  language           text not null default 'en',
  author_type        text,                          -- 'author' | 'publisher' | 'coach' | ...
  genres             text[] not null default '{}',
  role               text not null default 'user' check (role in ('user','admin')),
  plan_id            text not null default 'free' references public.plans(id),
  ai_credits         integer not null default 25 check (ai_credits >= 0),
  credits_reset_at   timestamptz,
  onboarding_step    integer not null default 0,    -- 0 = not started, 6 = finished
  primary_goal       text,
  daily_budget_cents integer,
  marketing_consent  boolean not null default false,
  analytics_consent  boolean not null default false,
  organization_id    uuid references public.organizations(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create index if not exists profiles_org_idx on public.profiles(organization_id);

-- ---------------------------------------------------------------------
-- Books and the AI strategy artefacts derived from them
-- ---------------------------------------------------------------------

create table if not exists public.books (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  organization_id  uuid references public.organizations(id) on delete set null,
  title            text not null check (char_length(title) between 1 and 300),
  subtitle         text,
  author_name      text,
  description      text,
  genre            text,
  subgenre         text,
  price_cents      integer check (price_cents >= 0),
  currency         text not null default 'EUR',
  sales_url        text,
  cover_url        text,
  sample_text      text,                            -- optional manuscript excerpt
  author_bio       text,
  reviews_text     text,                            -- reviews the AUTHOR supplied
  target_countries text[] not null default '{}',
  status           text not null default 'draft'
                     check (status in ('draft','analyzed','promoting','archived')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists books_user_idx on public.books(user_id, created_at desc);

create table if not exists public.book_analysis (
  id                   uuid primary key default gen_random_uuid(),
  book_id              uuid not null references public.books(id) on delete cascade,
  positioning          text,
  core_promise         text,
  reader_problem       text,
  transformation       text,
  themes               text[] not null default '{}',
  purchase_motivations text[] not null default '{}',
  objections           text[] not null default '{}',
  opportunities        text[] not null default '{}',
  reasoning            text,
  model                text,
  created_at           timestamptz not null default now()
);

create index if not exists book_analysis_book_idx on public.book_analysis(book_id, created_at desc);

create table if not exists public.reader_personas (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null references public.books(id) on delete cascade,
  name         text not null,
  age_range    text,
  description  text,
  demographics text,
  interests    text[] not null default '{}',
  pain_points  text[] not null default '{}',
  desires      text[] not null default '{}',
  objections   text[] not null default '{}',
  triggers     text[] not null default '{}',
  motivations  text[] not null default '{}',
  messaging    text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists reader_personas_book_idx on public.reader_personas(book_id);

create table if not exists public.marketing_angles (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null references public.books(id) on delete cascade,
  persona_id   uuid references public.reader_personas(id) on delete set null,
  name         text not null,
  category     text,                                -- emotional | curiosity | ...
  explanation  text,
  hook         text,
  message      text,
  cta          text,
  format_hint  text,
  score        integer check (score between 0 and 100),
  created_at   timestamptz not null default now()
);

create index if not exists marketing_angles_book_idx on public.marketing_angles(book_id);

-- ---------------------------------------------------------------------
-- Creatives
-- ---------------------------------------------------------------------

create table if not exists public.creatives (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  book_id       uuid not null references public.books(id) on delete cascade,
  angle_id      uuid references public.marketing_angles(id) on delete set null,
  persona_id    uuid references public.reader_personas(id) on delete set null,
  parent_id     uuid references public.creatives(id) on delete set null, -- variations
  platform      text not null default 'meta',       -- meta | instagram | facebook | tiktok | google
  format        text not null default 'static',     -- static | carousel | story | reel | video_script | mockup | quote
  headline      text,
  primary_text  text,
  description   text,
  cta           text,
  body          jsonb not null default '{}'::jsonb, -- format-specific payload (slides, script beats…)
  visual_prompt text,                               -- concept brief for the image/video
  media_url     text,
  score         integer check (score between 0 and 100),
  score_detail  jsonb,                              -- per-dimension scores + reasons
  status        text not null default 'draft'
                  check (status in ('draft','ready','in_campaign','archived')),
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists creatives_user_idx on public.creatives(user_id, created_at desc);
create index if not exists creatives_book_idx on public.creatives(book_id);

-- ---------------------------------------------------------------------
-- Campaigns
-- ---------------------------------------------------------------------

create table if not exists public.campaigns (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  book_id              uuid not null references public.books(id) on delete cascade,
  name                 text not null,
  platform             text not null default 'meta',
  objective            text not null default 'conversions',
  daily_budget_cents   integer not null default 0 check (daily_budget_cents >= 0),
  currency             text not null default 'EUR',
  start_date           date,
  end_date             date,
  destination_type     text,                        -- website | landing_page | amazon | kobo | other
  destination_url      text,
  status               text not null default 'draft'
                         check (status in ('draft','scheduled','active','paused','completed','error')),
  status_detail        text,                        -- human-readable reason for 'error'
  external_campaign_id text,                        -- Meta campaign id once launched
  is_demo              boolean not null default false,
  launched_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists campaigns_user_idx on public.campaigns(user_id, created_at desc);

create table if not exists public.ad_sets (
  id                 uuid primary key default gen_random_uuid(),
  campaign_id        uuid not null references public.campaigns(id) on delete cascade,
  persona_id         uuid references public.reader_personas(id) on delete set null,
  name               text not null,
  audience           jsonb not null default '{}'::jsonb,
  daily_budget_cents integer not null default 0,
  external_id        text,
  status             text not null default 'draft',
  created_at         timestamptz not null default now()
);

create index if not exists ad_sets_campaign_idx on public.ad_sets(campaign_id);

create table if not exists public.ads (
  id          uuid primary key default gen_random_uuid(),
  ad_set_id   uuid not null references public.ad_sets(id) on delete cascade,
  creative_id uuid references public.creatives(id) on delete set null,
  name        text,
  external_id text,
  status      text not null default 'draft',
  created_at  timestamptz not null default now()
);

create index if not exists ads_ad_set_idx on public.ads(ad_set_id);

-- Daily rollup, one row per (campaign, ad, date). Rates (CTR/CPC/ROAS)
-- are NOT stored — they are derived at read time so a zero denominator
-- can be reported as "not enough data" instead of a fake 0 (spec §44).
create table if not exists public.performance_metrics (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.campaigns(id) on delete cascade,
  ad_id         uuid references public.ads(id) on delete cascade,
  metric_date   date not null,
  source        text not null default 'meta'        -- meta | website | amazon_attribution
                  check (source in ('meta','website','amazon_attribution','demo')),
  impressions   bigint not null default 0,
  reach         bigint not null default 0,
  clicks        bigint not null default 0,
  spend_cents   bigint not null default 0,
  conversions   bigint not null default 0,
  revenue_cents bigint not null default 0,
  units_sold    bigint not null default 0,
  raw           jsonb,
  synced_at     timestamptz not null default now(),
  unique (campaign_id, ad_id, metric_date, source)
);

create index if not exists performance_campaign_idx
  on public.performance_metrics(campaign_id, metric_date desc);

-- ---------------------------------------------------------------------
-- Website tracking (spec §17)
-- ---------------------------------------------------------------------

-- One row per author website that installs /bookboost/track/bb.js.
-- public_key is safe to embed in a page; write_secret is never exposed.
create table if not exists public.tracking_sites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  domain      text not null,
  public_key  text not null unique,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists tracking_sites_user_idx on public.tracking_sites(user_id);

create table if not exists public.tracking_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  site_id     uuid references public.tracking_sites(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  creative_id uuid references public.creatives(id) on delete set null,
  event_type  text not null                          -- page_view | add_to_cart | checkout | purchase | click
                check (event_type in ('click','page_view','add_to_cart','checkout','purchase')),
  value_cents bigint not null default 0,
  currency    text not null default 'EUR',
  utm         jsonb not null default '{}'::jsonb,
  -- Deliberately no IP address, no user agent, no cookie id: the tracking
  -- script only needs campaign attribution, so nothing that identifies a
  -- visitor is collected (GDPR data minimisation, spec §34).
  session_hash text,
  occurred_at timestamptz not null default now()
);

create index if not exists tracking_events_user_idx
  on public.tracking_events(user_id, occurred_at desc);
create index if not exists tracking_events_campaign_idx
  on public.tracking_events(campaign_id, occurred_at desc);

-- ---------------------------------------------------------------------
-- External integrations
-- ---------------------------------------------------------------------

-- OAuth connections (Meta today, Amazon Attribution next). Tokens are
-- written by the server only; RLS never grants clients SELECT on the
-- token columns — see the restricted view in 002_rls.sql.
create table if not exists public.integrations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  provider       text not null check (provider in ('meta','amazon_attribution','tiktok','google')),
  status         text not null default 'disconnected'
                   check (status in ('disconnected','connected','error','expired')),
  account_id     text,
  account_name   text,
  scopes         text[] not null default '{}',
  access_token   text,                               -- server-only
  refresh_token  text,                               -- server-only
  expires_at     timestamptz,
  last_synced_at timestamptz,
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, provider)
);

-- Amazon Attribution rows are kept apart from Meta/website numbers so
-- the two are never silently added together (spec §18).
create table if not exists public.amazon_attribution_metrics (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  book_id            uuid references public.books(id) on delete set null,
  campaign_id        uuid references public.campaigns(id) on delete set null,
  external_campaign  text,
  metric_date        date not null,
  clicks             bigint not null default 0,
  detail_page_views  bigint not null default 0,
  add_to_carts       bigint not null default 0,
  purchases          bigint not null default 0,
  units_sold         bigint not null default 0,
  product_sales_cents bigint not null default 0,
  currency           text not null default 'EUR',
  imported_at        timestamptz not null default now()
);

create index if not exists amazon_metrics_user_idx
  on public.amazon_attribution_metrics(user_id, metric_date desc);

-- ---------------------------------------------------------------------
-- Billing, credits, notifications, learning
-- ---------------------------------------------------------------------

create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  plan_id                text not null references public.plans(id),
  status                 text not null default 'inactive',
  stripe_customer_id     text,
  stripe_subscription_id text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.ai_usage (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  operation    text not null,
  credits_used integer not null default 0,
  book_id      uuid references public.books(id) on delete set null,
  model        text,
  input_tokens integer,
  output_tokens integer,
  succeeded    boolean not null default true,
  created_at   timestamptz not null default now()
);

create index if not exists ai_usage_user_idx on public.ai_usage(user_id, created_at desc);

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text not null,                          -- campaign_launched | winner | fatigue | ...
  title      text not null,
  message    text,
  link       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications(user_id, created_at desc);

-- Campaign learning engine (spec §24): one row per finished experiment,
-- used to spot patterns across a user's campaigns.
create table if not exists public.campaign_learnings (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  book_id        uuid references public.books(id) on delete set null,
  campaign_id    uuid references public.campaigns(id) on delete set null,
  creative_id    uuid references public.creatives(id) on delete set null,
  genre          text,
  persona_name   text,
  angle_category text,
  platform       text,
  format         text,
  spend_cents    bigint not null default 0,
  clicks         bigint not null default 0,
  impressions    bigint not null default 0,
  conversions    bigint not null default 0,
  revenue_cents  bigint not null default 0,
  recorded_at    timestamptz not null default now()
);

create index if not exists campaign_learnings_user_idx
  on public.campaign_learnings(user_id, recorded_at desc);

-- AI recommendations surfaced in the advisor / optimisation views.
create table if not exists public.recommendations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  campaign_id  uuid references public.campaigns(id) on delete cascade,
  creative_id  uuid references public.creatives(id) on delete set null,
  kind         text not null,                        -- pause | increase | test | refresh | audience | landing_page
  title        text not null,
  reason       text,
  metrics      jsonb not null default '{}'::jsonb,
  confidence   text not null default 'medium' check (confidence in ('low','medium','high')),
  action       text,
  status       text not null default 'open' check (status in ('open','applied','dismissed')),
  created_at   timestamptz not null default now()
);

create index if not exists recommendations_user_idx
  on public.recommendations(user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Compliance: consent records, GDPR requests, audit log (spec §33, §34)
-- ---------------------------------------------------------------------

create table if not exists public.consent_records (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  purpose     text not null,                         -- analytics | marketing | terms | privacy
  granted     boolean not null,
  policy_version text,
  recorded_at timestamptz not null default now()
);

create index if not exists consent_records_user_idx
  on public.consent_records(user_id, recorded_at desc);

create table if not exists public.gdpr_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('export','deletion')),
  status       text not null default 'pending'
                 check (status in ('pending','processing','completed','failed')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  detail       text
);

-- Append-only. Written with the service role from the API layer; users
-- can read their own entries, nobody can update or delete them.
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  action      text not null,
  entity      text,
  entity_id   text,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_log_user_idx on public.audit_log(user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

create or replace function public.bb_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','books','creatives','campaigns','subscriptions','integrations','plans'
  ]
  loop
    execute format(
      'drop trigger if exists bb_touch_%1$s on public.%1$s;
       create trigger bb_touch_%1$s before update on public.%1$s
       for each row execute function public.bb_touch_updated_at();', t);
  end loop;
end;
$$;

-- A profile row must exist the moment a user signs up, otherwise the
-- first API call after signup has nothing to read.
create or replace function public.bb_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists bb_on_auth_user_created on auth.users;
create trigger bb_on_auth_user_created
  after insert on auth.users
  for each row execute function public.bb_handle_new_user();
