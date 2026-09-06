-- =====================================================================
-- BookPilot AI — seed data
--
-- Plans, credit costs, feature flags and system settings. Everything
-- here is editable from the admin panel afterwards; these are only the
-- starting values.
--
-- AI prompts are deliberately NOT seeded here. The canonical text lives
-- in netlify/functions/bookpilot-lib/prompts.js (version-controlled and
-- reviewable in a diff). The admin panel's "publish defaults" action
-- copies them into public.ai_prompts when an operator wants to edit a
-- prompt without a deploy; until then the bundled defaults are used.
-- Keeping one copy avoids the two drifting apart.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Plans (spec §29)
-- ---------------------------------------------------------------------
insert into public.plans
  (id, name, price_cents, currency, billing_interval, book_limit, creative_limit,
   monthly_credits, team_seats, sort_order, features)
values
  ('free', 'Free', 0, 'EUR', 'month', 1, 3, 25, 1, 0, jsonb_build_array(
     '1 book',
     'Book analysis + 5 AI generations',
     '3 creatives',
     'Basic analytics',
     'Demo campaign'
   )),
  ('author', 'Author', 1900, 'EUR', 'month', 3, 30, 100, 1, 1, jsonb_build_array(
     'Up to 3 books',
     '100 AI credits per month',
     '30 creatives',
     'Campaign builder',
     'Analytics',
     'AI Advisor'
   )),
  ('author_pro', 'Author Pro', 4900, 'EUR', 'month', null, null, 500, 1, 2, jsonb_build_array(
     'Unlimited books',
     '500 AI credits per month',
     'Advanced creatives',
     'Video scripts',
     'Meta integration',
     'Advanced analytics',
     'Optimisation recommendations',
     'Attribution tools'
   )),
  ('publisher', 'Publisher', 14900, 'EUR', 'month', null, null, 2000, 5, 3, jsonb_build_array(
     'Multiple authors',
     'Unlimited books',
     'Team members',
     'Advanced analytics',
     'Campaign management',
     'Priority processing',
     'Publisher dashboard'
   ))
on conflict (id) do nothing;

-- The free tier's bullet says "5 AI generations", but a book analysis
-- alone costs 10 credits — a free account that cannot analyse its own
-- book never reaches the product's first value moment. 25 credits buys
-- one analysis plus a handful of text generations. Change it in the
-- admin panel if the funnel says otherwise.

-- ---------------------------------------------------------------------
-- Credit costs (spec §30)
-- ---------------------------------------------------------------------
insert into public.credit_costs (operation, label, credits) values
  ('book_analysis',           'Book analysis',                10),
  ('reader_personas',         'Reader persona generation',    10),
  ('marketing_angles',        'Marketing angle generation',    5),
  ('ad_copy',                 'Ad copy generation',            1),
  ('creative_concept',        'Creative concept',              1),
  ('creative_image',          'Image creative',                5),
  ('creative_image_advanced', 'Advanced image creative',       8),
  ('video_concept',           'Video concept / script',        5),
  ('video_generation',        'Video generation',             20),
  ('creative_scoring',        'Creative scoring',              1),
  ('advisor_message',         'AI Advisor message',            2),
  ('performance_analysis',    'Campaign performance analysis',10),
  ('budget_recommendation',   'Budget recommendation',         2)
on conflict (operation) do nothing;

-- ---------------------------------------------------------------------
-- Feature flags
--
-- The integration flags start OFF. Each one only does something once
-- the matching credentials are configured on the server; with the flag
-- off the UI shows "Connect integration" instead of pretending a
-- connection exists (spec §16, §55).
-- ---------------------------------------------------------------------
insert into public.feature_flags (key, enabled, description) values
  ('meta_integration',   false, 'Meta Marketing API campaign creation and insights sync'),
  ('amazon_attribution', false, 'Amazon Attribution import'),
  ('image_generation',   false, 'AI image rendering for creatives (concepts always available)'),
  ('video_generation',   false, 'AI video rendering'),
  ('stripe_billing',     false, 'Stripe checkout and subscription management'),
  ('google_oauth',       false, 'Sign in with Google'),
  ('demo_mode',          true,  'Public demo workspace with clearly labelled sample data')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- System settings
-- ---------------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('ai_model',                to_jsonb('claude-opus-5'::text)),
  ('ai_effort',               to_jsonb('high'::text)),
  ('max_campaigns_per_user',  to_jsonb(50)),
  ('max_books_per_user',      to_jsonb(100)),
  ('ai_rate_limit_per_hour',  to_jsonb(60)),
  ('policy_version',          to_jsonb('2026-01'::text))
on conflict (key) do nothing;
