-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Marketing Automation (spec v3, Module 6).                                 ║
-- ║   • marketing_campaigns — audience resolved with INDEXED queries; the      ║
-- ║     pipeline materializes campaign_recipients in 1,000-row batches via      ║
-- ║     enqueue_campaign_recipients() (resumable, keyset on customer id).       ║
-- ║   • unique (campaign_id, customer_id) makes sends IDEMPOTENT — a resumed    ║
-- ║     run can never double-enqueue, and dispatch only touches 'pending'.      ║
-- ║   • campaign_events — raw tracking stream (sent/opened/clicked/...);        ║
-- ║     analytics reads campaign_stats / refresh_campaign_stats(), never the    ║
-- ║     raw stream per page load.                                               ║
-- ║   • automation_rules + automation_executions (unique dedupe_key) so cron     ║
-- ║     runs are idempotent — a rule fires once per customer per occurrence.    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create table public.marketing_campaigns (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  audience_type    text not null default 'all' check (audience_type in ('all','tier','segment','custom')),
  audience_value   jsonb not null default '{}'::jsonb,
  -- tier: {tier_keys:[...]} · segment: {segment_id} · custom: inline filter JSON
  channel          text not null check (channel in ('email','sms','whatsapp','in_app')),
  subject          text,
  template         text not null default '',          -- merge tags: {{name}} {{tier}} {{voucher_code}}
  voucher_id       uuid references public.vouchers (id) on delete set null,
  schedule_at      timestamptz,
  status           text not null default 'draft'
                   check (status in ('draft','scheduled','running','completed','cancelled')),
  total_recipients integer not null default 0,
  sent_count       integer not null default 0,
  failed_count     integer not null default 0,
  enqueue_cursor   uuid,                              -- resumable audience materialization
  created_by       uuid references public.users (id) on delete set null,
  started_at       timestamptz,
  completed_at     timestamptz,
  is_active        boolean not null default true,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_campaigns_status on public.marketing_campaigns (status);
create index idx_campaigns_channel on public.marketing_campaigns (channel);
create index idx_campaigns_schedule on public.marketing_campaigns (schedule_at) where status = 'scheduled';
create index idx_campaigns_created_keyset on public.marketing_campaigns (created_at desc, id desc);
create trigger trg_campaigns_updated before update on public.marketing_campaigns
  for each row execute function public.set_updated_at();

create table public.campaign_recipients (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaigns (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  error       text,
  merge_data  jsonb,                                  -- snapshot for rendering ({{name}}, {{voucher_code}}…)
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (campaign_id, customer_id)                   -- never double-enqueue → never double-send
);
create index idx_recipients_campaign_status on public.campaign_recipients (campaign_id, status);
create index idx_recipients_customer on public.campaign_recipients (customer_id);

create table public.campaign_events (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaigns (id) on delete cascade,
  recipient_id uuid references public.campaign_recipients (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  event_type  text not null check (event_type in
              ('sent','delivered','opened','clicked','converted','bounced','unsubscribed')),
  metadata    jsonb not null default '{}'::jsonb,     -- url clicked, order id converted, etc.
  created_at  timestamptz not null default now()
);
create index idx_events_campaign_type on public.campaign_events (campaign_id, event_type);
create index idx_events_created on public.campaign_events (created_at desc);

-- Pre-aggregated campaign analytics (refreshed after dispatch batches / by cron;
-- pages read THIS, never the raw event stream).
create table public.campaign_stats (
  campaign_id        uuid primary key references public.marketing_campaigns (id) on delete cascade,
  sent               integer not null default 0,
  delivered          integer not null default 0,
  opened             integer not null default 0,
  clicked            integer not null default 0,
  converted          integer not null default 0,
  bounced            integer not null default 0,
  unsubscribed       integer not null default 0,
  revenue_cents      bigint not null default 0,
  redemptions        integer not null default 0,
  refreshed_at       timestamptz not null default now()
);

create or replace function public.refresh_campaign_stats(p_campaign_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.campaign_stats as cs
    (campaign_id, sent, delivered, opened, clicked, converted, bounced, unsubscribed,
     revenue_cents, redemptions, refreshed_at)
  select
    p_campaign_id,
    count(*) filter (where e.event_type = 'sent'),
    count(*) filter (where e.event_type = 'delivered'),
    count(distinct e.customer_id) filter (where e.event_type = 'opened'),
    count(distinct e.customer_id) filter (where e.event_type = 'clicked'),
    count(distinct e.customer_id) filter (where e.event_type = 'converted'),
    count(*) filter (where e.event_type = 'bounced'),
    count(*) filter (where e.event_type = 'unsubscribed'),
    coalesce((select sum((e2.metadata ->> 'order_total_cents')::bigint)
              from public.campaign_events e2
              where e2.campaign_id = p_campaign_id and e2.event_type = 'converted'), 0),
    coalesce((select count(*) from public.voucher_redemptions vr
              join public.marketing_campaigns mc on mc.id = p_campaign_id
              where vr.voucher_id = mc.voucher_id), 0),
    now()
  from public.campaign_events e
  where e.campaign_id = p_campaign_id
  on conflict (campaign_id) do update set
    sent = excluded.sent, delivered = excluded.delivered, opened = excluded.opened,
    clicked = excluded.clicked, converted = excluded.converted, bounced = excluded.bounced,
    unsubscribed = excluded.unsubscribed, revenue_cents = excluded.revenue_cents,
    redemptions = excluded.redemptions, refreshed_at = now();
$$;
grant execute on function public.refresh_campaign_stats(uuid) to authenticated, service_role;

-- ── Resumable, batched audience materialization ──────────────────────────────
-- Inserts up to p_batch recipients per call, walking customers by id keyset.
-- Filters run on INDEXED columns (tier, spend, order_count, last purchase,
-- region). Re-running after a crash continues from enqueue_cursor; the unique
-- constraint absorbs any overlap. Returns rows inserted (0 = audience done).
create or replace function public.enqueue_campaign_recipients(
  p_campaign_id uuid,
  p_batch integer default 1000
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  c record;
  f jsonb;
  v_count integer;
  v_last uuid;
begin
  select * into c from public.marketing_campaigns where id = p_campaign_id for update;
  if c.id is null then raise exception 'Campaign % not found', p_campaign_id; end if;

  -- Resolve the effective filter JSON.
  f := case c.audience_type
    when 'segment' then coalesce(
      (select s.filter from public.customer_segments s
        where s.id = (c.audience_value ->> 'segment_id')::uuid), '{}'::jsonb)
    when 'custom' then c.audience_value
    when 'tier'   then jsonb_build_object('tier_keys', c.audience_value -> 'tier_keys')
    else '{}'::jsonb
  end;

  with batch as (
    select cu.id, cu.name, cu.email, cu.phone, t.name as tier_name
    from public.customers cu
    left join public.customer_tiers t on t.id = cu.current_tier_id
    where cu.deleted_at is null
      and (c.enqueue_cursor is null or cu.id > c.enqueue_cursor)
      and (f -> 'tier_keys' is null
           or cu.current_tier_id in (select id from public.customer_tiers
                                     where key in (select jsonb_array_elements_text(f -> 'tier_keys'))))
      and (f ->> 'spend_min_cents' is null or cu.lifetime_spend_cents >= (f ->> 'spend_min_cents')::bigint)
      and (f ->> 'spend_max_cents' is null or cu.lifetime_spend_cents <= (f ->> 'spend_max_cents')::bigint)
      and (f ->> 'order_count_min' is null or cu.order_count >= (f ->> 'order_count_min')::int)
      and (f ->> 'last_purchase_after'  is null or cu.last_purchase_date >= (f ->> 'last_purchase_after')::date)
      and (f ->> 'last_purchase_before' is null or cu.last_purchase_date <= (f ->> 'last_purchase_before')::date)
      and (f -> 'regions' is null
           or cu.region in (select jsonb_array_elements_text(f -> 'regions')))
      and (f ->> 'product_id' is null
           or exists (select 1 from public.orders o
                      join public.order_items oi on oi.order_id = o.id
                      where o.customer_id = cu.id
                        and oi.product_id = (f ->> 'product_id')::uuid))
    order by cu.id
    limit p_batch
  ),
  ins as (
    insert into public.campaign_recipients (campaign_id, customer_id, merge_data)
    select c.id, b.id,
           jsonb_build_object('name', b.name, 'email', b.email, 'phone', b.phone,
                              'tier', coalesce(b.tier_name, 'Bronze'))
    from batch b
    on conflict (campaign_id, customer_id) do nothing
    returning customer_id
  )
  select count(*), max(b.id) into v_count, v_last
  from batch b;

  if v_last is not null then
    update public.marketing_campaigns
      set enqueue_cursor = v_last,
          total_recipients = (select count(*) from public.campaign_recipients
                              where campaign_id = p_campaign_id)
      where id = p_campaign_id;
  end if;

  return coalesce(v_count, 0);
end;
$$;
grant execute on function public.enqueue_campaign_recipients(uuid, integer) to authenticated, service_role;

-- ── Automation rules ─────────────────────────────────────────────────────────
create table public.automation_rules (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  event_type    text not null check (event_type in
                ('tier_reached','inactivity','birthday','spend_threshold')),
  condition     jsonb not null default '{}'::jsonb,
  -- tier_reached: {tier_key} · inactivity: {days} · birthday: {} · spend_threshold: {amount_cents, window}
  action_type   text not null check (action_type in
                ('issue_voucher','send_notification','upgrade_tier','send_campaign')),
  action_config jsonb not null default '{}'::jsonb,
  -- issue_voucher: {type, value_percent|value_cents, valid_days} · send_notification: {title, body}
  is_enabled    boolean not null default true,
  last_run_at   timestamptz,
  created_by    uuid references public.users (id) on delete set null,
  is_active     boolean not null default true,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_automation_enabled on public.automation_rules (is_enabled) where deleted_at is null;
create trigger trg_automation_rules_updated before update on public.automation_rules
  for each row execute function public.set_updated_at();

-- One row per (rule, customer, occurrence). dedupe_key examples:
-- 'tier_reached:gold' · 'birthday:2026' · 'inactivity:2026-06' · 'spend:50000'
-- The unique constraint is what makes cron-driven automation IDEMPOTENT.
create table public.automation_executions (
  id          uuid primary key default gen_random_uuid(),
  rule_id     uuid not null references public.automation_rules (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  dedupe_key  text not null,
  result      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (rule_id, customer_id, dedupe_key)
);
create index idx_automation_exec_customer on public.automation_executions (customer_id);
create index idx_automation_exec_created on public.automation_executions (created_at desc);

-- ════════════════════════ GRANTS + RLS ══════════════════════════════════════
grant select, insert, update on public.marketing_campaigns, public.automation_rules to authenticated;
grant select on public.campaign_recipients, public.campaign_events,
  public.campaign_stats, public.automation_executions to authenticated;

alter table public.marketing_campaigns  enable row level security;
alter table public.campaign_recipients  enable row level security;
alter table public.campaign_events      enable row level security;
alter table public.campaign_stats       enable row level security;
alter table public.automation_rules     enable row level security;
alter table public.automation_executions enable row level security;

-- Campaigns: staff view (read-only marketing data); admin manages.
create policy campaigns_select on public.marketing_campaigns for select to authenticated using (true);
create policy campaigns_insert on public.marketing_campaigns for insert to authenticated
  with check (public.is_admin());
create policy campaigns_update on public.marketing_campaigns for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Recipients/events/stats: read-only via Data API; writes via RPCs/service role.
create policy recipients_select on public.campaign_recipients for select to authenticated using (true);
create policy events_select on public.campaign_events for select to authenticated using (true);
create policy stats_select on public.campaign_stats for select to authenticated using (true);

create policy automation_select on public.automation_rules for select to authenticated using (true);
create policy automation_insert on public.automation_rules for insert to authenticated
  with check (public.is_admin());
create policy automation_update on public.automation_rules for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy automation_exec_select on public.automation_executions for select to authenticated using (true);
