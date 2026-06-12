-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Activity Log v6 (spec Module 9) — tamper-proof, partitioned audit trail.  ║
-- ║                                                                            ║
-- ║  • MONTH-PARTITIONED by created_at: time-range queries prune to a few      ║
-- ║    partitions and retention purges DROP whole partitions instead of        ║
-- ║    deleting millions of rows. ensure_activity_log_partitions() (cron)      ║
-- ║    keeps current+next months present.                                      ║
-- ║  • APPEND-ONLY AT THE DB LEVEL: UPDATE/DELETE are revoked from every API   ║
-- ║    role and no RLS write policies exist; purge_activity_logs() (SECURITY   ║
-- ║    DEFINER, service-role-exec-only) is the single sanctioned deletion      ║
-- ║    path and logs itself.                                                   ║
-- ║  • HASH CHAIN: a BEFORE INSERT trigger serializes via advisory lock and    ║
-- ║    stamps each row with chain_seq, prev_hash and                           ║
-- ║    row_hash = sha256(prev_hash ‖ canonical payload).                       ║
-- ║    verify_activity_log_chain() re-computes recent links; the cron job      ║
-- ║    alerts Admins on any mismatch.                                          ║
-- ║  • severity (info/warning/critical) + batch_id (groups bulk actions) +     ║
-- ║    GIN full-text on summary (tsvector) alongside the trigram index.        ║
-- ║  • campaign_events gets the same month partitioning (high-volume,          ║
-- ║    append-only tracking stream).                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create extension if not exists pgcrypto with schema extensions;

-- ── Chain state (single row; advisory lock serializes writers) ───────────────
create table public.activity_log_chain (
  id        integer primary key default 1 check (id = 1),
  last_seq  bigint not null default 0,
  last_hash text   not null default repeat('0', 64)
);
insert into public.activity_log_chain (id) values (1);

-- ── New partitioned table ────────────────────────────────────────────────────
create table public.activity_logs_v6 (
  id          uuid not null default gen_random_uuid(),
  actor_id    uuid references public.users (id) on delete set null,
  actor_email text,
  action      text not null,
  module      text not null,
  target_type text,
  target_id   text,
  summary     text not null,
  before_data jsonb,
  after_data  jsonb,
  severity    text not null default 'info' check (severity in ('info','warning','critical')),
  batch_id    uuid,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now(),
  chain_seq   bigint not null,
  prev_hash   text not null,
  row_hash    text not null,
  summary_tsv tsvector generated always as (to_tsvector('english', coalesce(summary, ''))) stored,
  primary key (id, created_at)
) partition by range (created_at);

-- Keep current + the next N months materialized (also creates a catch-all
-- window backwards when first called so historical copies always land).
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
        'create table public.%I partition of public.activity_logs_v6 for values from (%L) to (%L)',
        v_name, m, (m + interval '1 month')
      );
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
grant execute on function public.ensure_activity_log_partitions(integer, integer) to service_role;

-- Cover all existing data (seed/demo spans ≤ ~6 months back) + next month.
select public.ensure_activity_log_partitions(12, 1);

-- ── Hash-chain trigger ────────────────────────────────────────────────────────
create or replace function public.set_activity_log_hash()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  c record;
  payload text;
begin
  -- Serialize chain writers (one short critical section per audit row).
  perform pg_advisory_xact_lock(hashtext('activity_log_chain'));
  select * into c from public.activity_log_chain where id = 1;

  new.chain_seq := c.last_seq + 1;
  new.prev_hash := c.last_hash;
  payload := concat_ws('|',
    coalesce(new.actor_id::text, ''), coalesce(new.actor_email, ''),
    new.action, new.module,
    coalesce(new.target_type, ''), coalesce(new.target_id, ''),
    new.summary,
    coalesce(new.before_data::text, ''), coalesce(new.after_data::text, ''),
    new.severity, coalesce(new.batch_id::text, ''),
    coalesce(new.ip_address, ''), new.created_at::text
  );
  new.row_hash := encode(extensions.digest(convert_to(c.last_hash || payload, 'utf8'), 'sha256'), 'hex');

  update public.activity_log_chain
    set last_seq = new.chain_seq, last_hash = new.row_hash
    where id = 1;
  return new;
end;
$$;

create trigger trg_activity_log_hash before insert on public.activity_logs_v6
  for each row execute function public.set_activity_log_hash();

-- ── Copy existing history through the chain (insert order = chain order) ────
insert into public.activity_logs_v6
  (id, actor_id, actor_email, action, module, target_type, target_id, summary,
   before_data, after_data, severity, batch_id, ip_address, user_agent, created_at)
select
  id, actor_id, actor_email, action, module, target_type, target_id, summary,
  before_data, after_data,
  case
    when action ~ '(ban|purge|bulk_delete|delete|update_role)' then 'critical'
    when action ~ '(login_failed|lockout|deactivate)' then 'warning'
    else 'info'
  end,
  null, ip_address, user_agent, created_at
from public.activity_logs
order by created_at, id;

-- ── Swap ─────────────────────────────────────────────────────────────────────
drop table public.activity_logs;
alter table public.activity_logs_v6 rename to activity_logs;

-- Partitioned indexes (created on every existing + future partition).
create index idx_activity_created_keyset on public.activity_logs (created_at desc, id desc);
create index idx_activity_actor on public.activity_logs (actor_id, created_at desc);
create index idx_activity_target on public.activity_logs (target_type, target_id, created_at desc);
create index idx_activity_module on public.activity_logs (module);
create index idx_activity_action on public.activity_logs (action);
create index idx_activity_severity on public.activity_logs (severity) where severity <> 'info';
create index idx_activity_batch on public.activity_logs (batch_id) where batch_id is not null;
create index idx_activity_summary_trgm on public.activity_logs using gin (summary extensions.gin_trgm_ops);
create index idx_activity_summary_fts on public.activity_logs using gin (summary_tsv);
create index idx_activity_chain_seq on public.activity_logs (chain_seq);

-- Re-attach the per-user daily rollup (0014) — AFTER the copy, so historical
-- rows aren't double-counted into user_activity_daily.
create trigger trg_bump_user_activity after insert on public.activity_logs
  for each row execute function public.bump_user_activity_daily();

-- ── Grants + RLS: APPEND-ONLY for every API role ─────────────────────────────
grant select, insert on public.activity_logs to authenticated;
revoke update, delete on public.activity_logs from authenticated, anon, service_role;
revoke all on public.activity_log_chain from authenticated, anon;

alter table public.activity_logs enable row level security;
create policy logs_select on public.activity_logs for select to authenticated
  using (public.is_admin() or actor_id = auth.uid());
create policy logs_insert on public.activity_logs for insert to authenticated
  with check (public.is_admin() or actor_id = auth.uid());
-- No UPDATE/DELETE policies — and no grants — by design.

alter table public.activity_log_chain enable row level security;

-- ── Integrity check (cron alerts Admins on mismatch) ─────────────────────────
create or replace function public.verify_activity_log_chain(p_limit integer default 5000)
returns table (checked bigint, mismatches bigint, first_bad_seq bigint)
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  r record;
  v_checked bigint := 0;
  v_bad bigint := 0;
  v_first bigint := null;
  v_expected text;
  v_prev_hash text := null;  -- the row_hash of the previous (lower-seq) row
  payload text;
begin
  for r in
    select * from (
      select * from public.activity_logs order by chain_seq desc limit p_limit
    ) recent order by chain_seq asc
  loop
    payload := concat_ws('|',
      coalesce(r.actor_id::text, ''), coalesce(r.actor_email, ''),
      r.action, r.module,
      coalesce(r.target_type, ''), coalesce(r.target_id, ''),
      r.summary,
      coalesce(r.before_data::text, ''), coalesce(r.after_data::text, ''),
      r.severity, coalesce(r.batch_id::text, ''),
      coalesce(r.ip_address, ''), r.created_at::text
    );
    v_expected := encode(extensions.digest(convert_to(r.prev_hash || payload, 'utf8'), 'sha256'), 'hex');
    if v_expected <> r.row_hash
       or (v_prev_hash is not null and r.prev_hash <> v_prev_hash) then
      v_bad := v_bad + 1;
      v_first := coalesce(v_first, r.chain_seq);
    end if;
    v_prev_hash := r.row_hash;
    v_checked := v_checked + 1;
  end loop;
  return query select v_checked, v_bad, v_first;
end;
$$;
grant execute on function public.verify_activity_log_chain(integer) to service_role;

-- ── The single sanctioned purge path ─────────────────────────────────────────
-- Drops whole partitions strictly older than the cutoff, then row-deletes the
-- boundary remainder. Dry-run returns the would-be row count for the preview.
-- Logs itself (critical) AFTER the deletion, through the normal insert path so
-- the purge becomes part of the chain.
create or replace function public.purge_activity_logs(
  p_before  date,
  p_dry_run boolean default true,
  p_actor   uuid default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  part record;
  part_to date;
  v_rows bigint := 0;
  v_part_rows bigint;
begin
  if p_dry_run then
    select count(*) into v_rows from public.activity_logs where created_at < p_before;
    return v_rows;
  end if;

  for part in
    select c.relname,
           pg_get_expr(c.relpartbound, c.oid) as bound
    from pg_inherits i
    join pg_class c on c.oid = i.inhrelid
    join pg_class p on p.oid = i.inhparent
    where p.relname = 'activity_logs' and p.relnamespace = 'public'::regnamespace
  loop
    -- bound looks like: FOR VALUES FROM ('2026-01-01 ...') TO ('2026-02-01 ...')
    part_to := (regexp_match(part.bound, $re$TO \('([^']+)'\)$re$))[1]::date;
    if part_to is not null and part_to <= p_before then
      execute format('select count(*) from public.%I', part.relname) into v_part_rows;
      execute format('alter table public.activity_logs detach partition public.%I', part.relname);
      execute format('drop table public.%I', part.relname);
      v_rows := v_rows + v_part_rows;
    end if;
  end loop;

  -- Boundary partition remainder (rows older than cutoff inside a kept month).
  delete from public.activity_logs where created_at < p_before;
  get diagnostics v_part_rows = row_count;
  v_rows := v_rows + v_part_rows;

  insert into public.activity_logs
    (actor_id, action, module, target_type, summary, severity, after_data)
  values
    (p_actor, 'logs.purge', 'logs', 'activity_logs',
     format('Purged %s activity-log entries older than %s', v_rows, p_before),
     'critical', jsonb_build_object('before', p_before, 'rows', v_rows));

  return v_rows;
end;
$$;
revoke execute on function public.purge_activity_logs(date, boolean, uuid) from public, anon, authenticated;
grant execute on function public.purge_activity_logs(date, boolean, uuid) to service_role;

-- ── Live tail ─────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.activity_logs;

-- ═══════════════════ campaign_events: month partitioning ════════════════════
create table public.campaign_events_v6 (
  id          uuid not null default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaigns (id) on delete cascade,
  recipient_id uuid,
  customer_id uuid references public.customers (id) on delete set null,
  event_type  text not null check (event_type in
              ('sent','delivered','opened','clicked','converted','bounced','unsubscribed')),
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);

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
        'create table public.%I partition of public.campaign_events_v6 for values from (%L) to (%L)',
        v_name, m, (m + interval '1 month')
      );
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
grant execute on function public.ensure_campaign_event_partitions(integer, integer) to service_role;
select public.ensure_campaign_event_partitions(12, 1);

insert into public.campaign_events_v6
  (id, campaign_id, recipient_id, customer_id, event_type, metadata, created_at)
select id, campaign_id, recipient_id, customer_id, event_type, metadata, created_at
from public.campaign_events;

drop table public.campaign_events;
alter table public.campaign_events_v6 rename to campaign_events;

create index idx_events_campaign_type on public.campaign_events (campaign_id, event_type);
create index idx_events_created on public.campaign_events (created_at desc);

grant select on public.campaign_events to authenticated;
alter table public.campaign_events enable row level security;
create policy events_select on public.campaign_events for select to authenticated using (true);
