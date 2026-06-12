-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0026 — close the partition-level append-only hole.                         ║
-- ║                                                                            ║
-- ║  0024 enabled RLS + revoked UPDATE/DELETE on the PARENT activity_logs /     ║
-- ║  campaign_events, but neither cascades to partition children. Supabase's    ║
-- ║  default privileges re-GRANT ALL (incl. UPDATE/DELETE) to anon/authenticated║
-- ║  on every partition the ensure_*_partitions() functions create, and the     ║
-- ║  children had RLS disabled — so a logged-in user could DELETE/UPDATE audit  ║
-- ║  rows by hitting /rest/v1/activity_logs_2026_06 directly, bypassing the     ║
-- ║  hash chain and the parent's policies.                                      ║
-- ║                                                                            ║
-- ║  Fix: enable RLS + revoke all API-role privileges on every existing child, ║
-- ║  and bake the same hardening into the partition-creator functions so future║
-- ║  months stay locked. Legit access is unaffected: the app always reads/      ║
-- ║  writes through the PARENT (privileges + RLS checked on the named parent,   ║
-- ║  tuple routing does not re-check the child), and purge/partition functions  ║
-- ║  are SECURITY DEFINER owned by postgres (owner bypasses RLS and grants).    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 1. Harden every EXISTING partition child ─────────────────────────────────
do $$
declare
  child text;
begin
  for child in
    select inhrelid::regclass::text
    from pg_inherits
    where inhparent in ('public.activity_logs'::regclass, 'public.campaign_events'::regclass)
  loop
    execute format('alter table %s enable row level security', child);
    -- API roles get nothing on children directly; access flows through the parent.
    execute format('revoke all on %s from authenticated, anon', child);
  end loop;
end;
$$;

-- ── 2. Bake the hardening into the partition creators ────────────────────────
create or replace function public.ensure_activity_log_partitions(
  p_months_back  integer default 1,
  p_months_ahead integer default 1
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  m date;
  v_name text;
  v_count integer := 0;
begin
  for i in -p_months_back .. p_months_ahead loop
    m := date_trunc('month', current_date)::date + make_interval(months => i);
    v_name := 'activity_logs_' || to_char(m, 'YYYY_MM');
    if to_regclass('public.' || v_name) is null then
      execute format(
        'create table public.%I partition of public.activity_logs for values from (%L) to (%L)',
        v_name, m, (m + interval '1 month')
      );
      -- Append-only at the partition level too: no direct API-role access, RLS on.
      execute format('alter table public.%I enable row level security', v_name);
      execute format('revoke all on public.%I from authenticated, anon', v_name);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
grant execute on function public.ensure_activity_log_partitions(integer, integer) to service_role;

create or replace function public.ensure_campaign_event_partitions(
  p_months_back  integer default 1,
  p_months_ahead integer default 1
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  m date;
  v_name text;
  v_count integer := 0;
begin
  for i in -p_months_back .. p_months_ahead loop
    m := date_trunc('month', current_date)::date + make_interval(months => i);
    v_name := 'campaign_events_' || to_char(m, 'YYYY_MM');
    if to_regclass('public.' || v_name) is null then
      execute format(
        'create table public.%I partition of public.campaign_events for values from (%L) to (%L)',
        v_name, m, (m + interval '1 month')
      );
      execute format('alter table public.%I enable row level security', v_name);
      execute format('revoke all on public.%I from authenticated, anon', v_name);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
grant execute on function public.ensure_campaign_event_partitions(integer, integer) to service_role;

-- (These functions originally referenced the *_v6 names from 0024; after 0024's
-- rename the live parents are public.activity_logs / public.campaign_events, so
-- a cron-driven creation of a future month now resolves correctly — this also
-- fixes a latent break in the 0024 definitions.)
