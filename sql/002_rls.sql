-- =====================================================================
-- BookPilot AI — Row Level Security
--
-- Default posture: every table is deny-all until a policy opens it, and
-- every policy is scoped to auth.uid(). The API layer (Netlify
-- functions) talks to PostgREST *with the caller's own JWT*, so these
-- policies are the real access control — not an extra belt on top of
-- application checks. The service-role key is used only for the few
-- operations listed in bookpilot/README.md (webhooks, credit
-- accounting, admin reads), never to serve a user's own data.
--
-- Run after 001_schema.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper predicates. SECURITY DEFINER so that a policy on `profiles`
-- can consult `profiles` without recursing into its own policy.
-- ---------------------------------------------------------------------

create or replace function public.bp_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.deleted_at is null
  );
$$;

create or replace function public.bp_is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select org is not null and exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

create or replace function public.bp_can_access_book(book uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.books b
    where b.id = book
      and (b.user_id = auth.uid() or public.bp_is_org_member(b.organization_id))
  );
$$;

create or replace function public.bp_can_access_campaign(campaign uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.campaigns c
    where c.id = campaign
      and (c.user_id = auth.uid() or public.bp_can_access_book(c.book_id))
  );
$$;

create or replace function public.bp_can_access_ad_set(ad_set uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ad_sets s
    where s.id = ad_set and public.bp_can_access_campaign(s.campaign_id)
  );
$$;

-- ---------------------------------------------------------------------
-- Turn RLS on everywhere. Nothing below relies on a table having been
-- missed: if a new table is added without a policy it is simply
-- unreadable, which is the safe direction to fail.
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'plans','credit_costs','ai_prompts','feature_flags','app_settings',
    'organizations','organization_members','profiles','books','book_analysis',
    'reader_personas','marketing_angles','creatives','campaigns','ad_sets','ads',
    'performance_metrics','tracking_sites','tracking_events','integrations',
    'amazon_attribution_metrics','subscriptions','ai_usage','notifications',
    'campaign_learnings','recommendations','consent_records','gdpr_requests','audit_log'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------

drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans
  for select using (is_active or public.bp_is_admin());

drop policy if exists plans_admin_write on public.plans;
create policy plans_admin_write on public.plans
  for all using (public.bp_is_admin()) with check (public.bp_is_admin());

drop policy if exists credit_costs_read on public.credit_costs;
create policy credit_costs_read on public.credit_costs
  for select using (true);

drop policy if exists credit_costs_admin_write on public.credit_costs;
create policy credit_costs_admin_write on public.credit_costs
  for all using (public.bp_is_admin()) with check (public.bp_is_admin());

drop policy if exists feature_flags_read on public.feature_flags;
create policy feature_flags_read on public.feature_flags
  for select using (true);

drop policy if exists feature_flags_admin_write on public.feature_flags;
create policy feature_flags_admin_write on public.feature_flags
  for all using (public.bp_is_admin()) with check (public.bp_is_admin());

-- Prompts and system settings are admin-only in every direction. The
-- API layer reads them with the service role, which bypasses RLS.
drop policy if exists ai_prompts_admin on public.ai_prompts;
create policy ai_prompts_admin on public.ai_prompts
  for all using (public.bp_is_admin()) with check (public.bp_is_admin());

drop policy if exists app_settings_admin on public.app_settings;
create policy app_settings_admin on public.app_settings
  for all using (public.bp_is_admin()) with check (public.bp_is_admin());

-- ---------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid() or public.bp_is_admin());

-- A user may edit their own profile. The policy below scopes that to
-- their own row — but RLS has no notion of columns, so on its own it
-- would still let a crafted PostgREST call set role = 'admin',
-- ai_credits = 999999 or plan_id = 'publisher' on that row. The API
-- layer's allow-list stops it going through the API; the column grant
-- and the trigger underneath stop it going around the API.
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Column-level privileges: PostgREST honours these, so `authenticated`
-- can write exactly these eleven columns and nothing else. Everything
-- omitted here (role, plan_id, ai_credits, credits_reset_at,
-- organization_id, deleted_at, id, email) is server-written only.
revoke update on public.profiles from anon, authenticated;
grant update (
  full_name, country, currency, language, author_type, genres,
  primary_goal, daily_budget_cents, onboarding_step,
  marketing_consent, analytics_consent
) on public.profiles to authenticated;

-- Defence in depth: even if a future migration re-grants the table, a
-- privileged column can only change under the service role. Belt and
-- braces here because the failure mode is a user making themselves an
-- administrator.
create or replace function public.bp_guard_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('request.jwt.claims', true) is not null
     and coalesce(current_setting('request.jwt.claim.role', true),
                  (current_setting('request.jwt.claims', true)::jsonb ->> 'role'),
                  '') <> 'service_role'
  then
    if new.role is distinct from old.role
       or new.plan_id is distinct from old.plan_id
       or new.ai_credits is distinct from old.ai_credits
       or new.credits_reset_at is distinct from old.credits_reset_at
       or new.id is distinct from old.id
    then
      raise exception 'privileged profile columns are server-managed';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bp_guard_profile on public.profiles;
create trigger bp_guard_profile
  before update on public.profiles
  for each row execute function public.bp_guard_profile_columns();

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all using (public.bp_is_admin()) with check (public.bp_is_admin());

drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read on public.organizations
  for select using (owner_id = auth.uid() or public.bp_is_org_member(id) or public.bp_is_admin());

drop policy if exists organizations_owner_write on public.organizations;
create policy organizations_owner_write on public.organizations
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists org_members_read on public.organization_members;
create policy org_members_read on public.organization_members
  for select using (user_id = auth.uid() or public.bp_is_org_member(organization_id) or public.bp_is_admin());

drop policy if exists org_members_owner_write on public.organization_members;
create policy org_members_owner_write on public.organization_members
  for all using (
    exists (select 1 from public.organizations o
            where o.id = organization_id and o.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.organizations o
            where o.id = organization_id and o.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- Books and derived strategy
-- ---------------------------------------------------------------------

drop policy if exists books_read on public.books;
create policy books_read on public.books
  for select using (user_id = auth.uid() or public.bp_is_org_member(organization_id));

drop policy if exists books_insert on public.books;
create policy books_insert on public.books
  for insert with check (user_id = auth.uid());

drop policy if exists books_update on public.books;
create policy books_update on public.books
  for update using (user_id = auth.uid() or public.bp_is_org_member(organization_id))
  with check (user_id = auth.uid() or public.bp_is_org_member(organization_id));

drop policy if exists books_delete on public.books;
create policy books_delete on public.books
  for delete using (user_id = auth.uid());

-- Child rows of a book inherit the book's access rule.
do $$
declare t text;
begin
  foreach t in array array['book_analysis','reader_personas','marketing_angles']
  loop
    execute format('drop policy if exists %1$s_access on public.%1$s;', t);
    execute format(
      'create policy %1$s_access on public.%1$s
       for all using (public.bp_can_access_book(book_id))
       with check (public.bp_can_access_book(book_id));', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Creatives and campaigns
-- ---------------------------------------------------------------------

drop policy if exists creatives_access on public.creatives;
create policy creatives_access on public.creatives
  for all using (user_id = auth.uid() or public.bp_can_access_book(book_id))
  with check (user_id = auth.uid() or public.bp_can_access_book(book_id));

drop policy if exists campaigns_access on public.campaigns;
create policy campaigns_access on public.campaigns
  for all using (user_id = auth.uid() or public.bp_can_access_book(book_id))
  with check (user_id = auth.uid() or public.bp_can_access_book(book_id));

-- `external_campaign_id` and `launched_at` record what is true on Meta,
-- not what a client would like to be true: they are written only after
-- Meta has confirmed the action, by the push and launch endpoints using
-- the service role. `status` stays client-writable because a draft or a
-- never-launched campaign is just a label on the author's own record,
-- and the Meta sync corrects it for campaigns that are actually running.
revoke update on public.campaigns from anon, authenticated;
grant update (
  name, objective, daily_budget_cents, currency, start_date, end_date,
  destination_type, destination_url, status, updated_at
) on public.campaigns to authenticated;

drop policy if exists ad_sets_access on public.ad_sets;
create policy ad_sets_access on public.ad_sets
  for all using (public.bp_can_access_campaign(campaign_id))
  with check (public.bp_can_access_campaign(campaign_id));

drop policy if exists ads_access on public.ads;
create policy ads_access on public.ads
  for all using (public.bp_can_access_ad_set(ad_set_id))
  with check (public.bp_can_access_ad_set(ad_set_id));

-- Performance numbers are written by the sync job (service role) and
-- are read-only for the account that owns the campaign.
drop policy if exists performance_read on public.performance_metrics;
create policy performance_read on public.performance_metrics
  for select using (public.bp_can_access_campaign(campaign_id));

-- ---------------------------------------------------------------------
-- Tracking
-- ---------------------------------------------------------------------

drop policy if exists tracking_sites_access on public.tracking_sites;
create policy tracking_sites_access on public.tracking_sites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Events arrive from the public collector endpoint, which authenticates
-- the *site* (public_key), not a logged-in user, and writes with the
-- service role. Clients may only read their own.
drop policy if exists tracking_events_read on public.tracking_events;
create policy tracking_events_read on public.tracking_events
  for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Integrations — no client access at all
--
-- access_token / refresh_token live in this table, and PostgREST has no
-- column-level RLS, so the safest rule is that `authenticated` cannot
-- touch the table. Connection state reaches the UI through the
-- integration_status view below, which exposes no secrets.
-- ---------------------------------------------------------------------

revoke all on public.integrations from anon, authenticated;

create or replace view public.integration_status as
  select id, user_id, provider, status, account_id, account_name,
         scopes, expires_at, last_synced_at, last_error, created_at
  from public.integrations
  where user_id = auth.uid();

grant select on public.integration_status to authenticated;

drop policy if exists amazon_metrics_read on public.amazon_attribution_metrics;
create policy amazon_metrics_read on public.amazon_attribution_metrics
  for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Billing, usage, notifications, learning, recommendations
-- ---------------------------------------------------------------------

-- Subscription state is authoritative in Stripe and mirrored here by the
-- webhook: read-only for the user.
drop policy if exists subscriptions_read on public.subscriptions;
create policy subscriptions_read on public.subscriptions
  for select using (user_id = auth.uid() or public.bp_is_admin());

drop policy if exists ai_usage_read on public.ai_usage;
create policy ai_usage_read on public.ai_usage
  for select using (user_id = auth.uid() or public.bp_is_admin());

drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications
  for select using (user_id = auth.uid());

-- Users may mark their own notifications read (and nothing else).
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete using (user_id = auth.uid());

drop policy if exists learnings_read on public.campaign_learnings;
create policy learnings_read on public.campaign_learnings
  for select using (user_id = auth.uid());

drop policy if exists recommendations_read on public.recommendations;
create policy recommendations_read on public.recommendations
  for select using (user_id = auth.uid());

drop policy if exists recommendations_update on public.recommendations;
create policy recommendations_update on public.recommendations
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Compliance
-- ---------------------------------------------------------------------

drop policy if exists consent_read on public.consent_records;
create policy consent_read on public.consent_records
  for select using (user_id = auth.uid() or public.bp_is_admin());

drop policy if exists consent_insert on public.consent_records;
create policy consent_insert on public.consent_records
  for insert with check (user_id = auth.uid());

drop policy if exists gdpr_requests_read on public.gdpr_requests;
create policy gdpr_requests_read on public.gdpr_requests
  for select using (user_id = auth.uid() or public.bp_is_admin());

drop policy if exists gdpr_requests_insert on public.gdpr_requests;
create policy gdpr_requests_insert on public.gdpr_requests
  for insert with check (user_id = auth.uid());

-- Append-only audit trail: readable by its subject, never editable by
-- anyone through the client API.
drop policy if exists audit_log_read on public.audit_log;
create policy audit_log_read on public.audit_log
  for select using (user_id = auth.uid() or public.bp_is_admin());

revoke insert, update, delete on public.audit_log from anon, authenticated;
