-- =====================================================================
-- BookPilot AI — database functions
--
-- Credit accounting has to be atomic: two AI requests arriving together
-- must not both read "12 credits left" and both spend 10. Doing the
-- check and the decrement in one statement inside the database is the
-- only way to guarantee that, so it lives here rather than in the API
-- layer.
--
-- Run after 003_seed.sql.
-- =====================================================================

-- Spend credits for one AI operation and record the usage row.
-- Returns the number of credits left, or raises `insufficient_credits`
-- when the balance is too low. The caller (bookpilot-lib/credits.js)
-- turns that into a friendly 402.
create or replace function public.bp_consume_credits(
  p_user      uuid,
  p_operation text,
  p_credits   integer,
  p_book      uuid default null,
  p_model     text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
begin
  if p_credits < 0 then
    raise exception 'invalid_credit_amount';
  end if;

  update public.profiles
     set ai_credits = ai_credits - p_credits
   where id = p_user
     and ai_credits >= p_credits
  returning ai_credits into v_remaining;

  if not found then
    raise exception 'insufficient_credits';
  end if;

  insert into public.ai_usage (user_id, operation, credits_used, book_id, model)
  values (p_user, p_operation, p_credits, p_book, p_model);

  return v_remaining;
end;
$$;

-- Give credits back when a charged operation failed afterwards (an
-- upstream timeout, say). Never used to hand out credits otherwise.
create or replace function public.bp_refund_credits(
  p_user    uuid,
  p_credits integer,
  p_reason  text default 'operation_failed'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
begin
  update public.profiles
     set ai_credits = ai_credits + greatest(p_credits, 0)
   where id = p_user
  returning ai_credits into v_remaining;

  insert into public.ai_usage (user_id, operation, credits_used, succeeded)
  values (p_user, 'refund:' || p_reason, -greatest(p_credits, 0), false);

  return v_remaining;
end;
$$;

-- Apply a plan change (Stripe webhook). Sets the plan and tops the
-- balance up to the plan's monthly allowance — it does not stack
-- allowances month on month.
create or replace function public.bp_apply_plan(
  p_user uuid,
  p_plan text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credits integer;
begin
  select monthly_credits into v_credits from public.plans where id = p_plan;
  if v_credits is null then
    raise exception 'unknown_plan';
  end if;

  update public.profiles
     set plan_id = p_plan,
         ai_credits = greatest(ai_credits, v_credits),
         credits_reset_at = date_trunc('month', now()) + interval '1 month'
   where id = p_user;
end;
$$;

-- Erase everything belonging to one account (GDPR Art. 17). Cascades do
-- most of the work; this function exists so the deletion is one
-- transaction and leaves an audit entry behind with no personal data in
-- it. The auth.users row is deleted separately by the API layer through
-- the Supabase admin endpoint.
create or replace function public.bp_delete_account(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.tracking_events where user_id = p_user;
  delete from public.performance_metrics
        where campaign_id in (select id from public.campaigns where user_id = p_user);
  delete from public.campaigns where user_id = p_user;
  delete from public.creatives where user_id = p_user;
  delete from public.books where user_id = p_user;
  delete from public.integrations where user_id = p_user;
  delete from public.amazon_attribution_metrics where user_id = p_user;
  delete from public.tracking_sites where user_id = p_user;
  delete from public.campaign_learnings where user_id = p_user;
  delete from public.recommendations where user_id = p_user;
  delete from public.notifications where user_id = p_user;
  delete from public.ai_usage where user_id = p_user;
  delete from public.consent_records where user_id = p_user;
  delete from public.subscriptions where user_id = p_user;
  delete from public.profiles where id = p_user;

  insert into public.audit_log (user_id, action, entity, detail)
  values (null, 'account.deleted', 'profile',
          jsonb_build_object('completed_at', now()));
end;
$$;

-- Admin dashboard counters (spec §31), computed in one round trip.
create or replace function public.bp_admin_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.bp_is_admin() then
    raise exception 'forbidden';
  end if;

  select jsonb_build_object(
    'total_users',      (select count(*) from public.profiles where deleted_at is null),
    'new_users_30d',    (select count(*) from public.profiles
                          where created_at > now() - interval '30 days'),
    'active_users_30d', (select count(distinct user_id) from public.ai_usage
                          where created_at > now() - interval '30 days'),
    'paying_users',     (select count(*) from public.subscriptions where status = 'active'),
    'mrr_cents',        (select coalesce(sum(p.price_cents), 0)
                           from public.subscriptions s
                           join public.plans p on p.id = s.plan_id
                          where s.status = 'active'),
    'credits_30d',      (select coalesce(sum(credits_used), 0) from public.ai_usage
                          where created_at > now() - interval '30 days'),
    'ai_calls_30d',     (select count(*) from public.ai_usage
                          where created_at > now() - interval '30 days'),
    'ai_failures_30d',  (select count(*) from public.ai_usage
                          where succeeded = false and created_at > now() - interval '30 days'),
    'books',            (select count(*) from public.books),
    'campaigns',        (select count(*) from public.campaigns),
    'live_campaigns',   (select count(*) from public.campaigns where status = 'active'),
    'ad_spend_cents',   (select coalesce(sum(spend_cents), 0) from public.performance_metrics
                          where source <> 'demo'),
    'conversion_events',(select count(*) from public.tracking_events
                          where event_type = 'purchase')
  ) into v;

  return v;
end;
$$;

revoke execute on function public.bp_consume_credits(uuid, text, integer, uuid, text) from anon, authenticated;
revoke execute on function public.bp_refund_credits(uuid, integer, text) from anon, authenticated;
revoke execute on function public.bp_apply_plan(uuid, text) from anon, authenticated;
revoke execute on function public.bp_delete_account(uuid) from anon, authenticated;
