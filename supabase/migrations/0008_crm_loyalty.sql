-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  CRM & Loyalty (spec v3, Module 5).                                        ║
-- ║   • customers gains INCREMENTALLY-MAINTAINED aggregates (lifetime/annual   ║
-- ║     spend, order count, last purchase, score) — O(1) updates inside the     ║
-- ║     delivery transaction; reconcile_customer_aggregates() is the scheduled  ║
-- ║     safety net. Never recomputed by scanning orders per request.            ║
-- ║   • customer_tiers (15 seeded tiers) + tier_benefits + rank history.        ║
-- ║   • evaluate_customer_tier(): idempotent upgrade engine (same inputs →      ║
-- ║     same tier; history written only on change).                             ║
-- ║   • vouchers + voucher_redemptions with SERVER-SIDE validity enforcement.   ║
-- ║   • customer_segments: reusable JSON filter definitions for Marketing.      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Tiers ────────────────────────────────────────────────────────────────────
create table public.customer_tiers (
  id                             uuid primary key default gen_random_uuid(),
  key                            text not null unique,      -- 'gold', 'elite_diamond', ...
  name                           text not null,
  group_name                     text not null,             -- Bronze|Silver|Gold|Platinum|Diamond|Black Diamond
  rank                           integer not null unique,   -- higher = better; drives upgrades
  badge_color                    text not null default 'slate',
  lifetime_spend_threshold_cents bigint not null default 0, -- min lifetime spend to qualify
  annual_spend_threshold_cents   bigint,                    -- optional extra rules (null = unused)
  min_order_count                integer,
  min_customer_score             numeric(12,2),
  is_active                      boolean not null default true,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now()
);
create trigger trg_customer_tiers_updated before update on public.customer_tiers
  for each row execute function public.set_updated_at();

-- One row per tier; editable benefit values (Settings → Loyalty).
create table public.tier_benefits (
  id                   uuid primary key default gen_random_uuid(),
  tier_id              uuid not null unique references public.customer_tiers (id) on delete cascade,
  discount_percent     numeric(5,2) not null default 0,
  voucher_amount_cents bigint not null default 0,   -- rank-upgrade voucher value (0 = none)
  free_shipping        boolean not null default false,
  priority_support     boolean not null default false,
  exclusive_promotions boolean not null default false,
  cashback_percent     numeric(5,2) not null default 0,
  updated_at           timestamptz not null default now()
);
create trigger trg_tier_benefits_updated before update on public.tier_benefits
  for each row execute function public.set_updated_at();

-- ── Customers: CRM aggregate + profile columns ───────────────────────────────
alter table public.customers
  add column lifetime_spend_cents bigint not null default 0,
  add column annual_spend_cents   bigint not null default 0,   -- rolling current calendar year
  add column order_count          integer not null default 0,
  add column last_purchase_date   date,
  add column customer_score       numeric(12,2) not null default 0,
  add column current_tier_id      uuid references public.customer_tiers (id) on delete set null,
  add column birthday             date,
  add column region               text;

create index idx_customers_tier on public.customers (current_tier_id);
create index idx_customers_lifetime_spend on public.customers (lifetime_spend_cents desc);
create index idx_customers_order_count on public.customers (order_count desc);
create index idx_customers_last_purchase on public.customers (last_purchase_date);
create index idx_customers_region on public.customers (region);
-- Birthday automation: find today's birthdays without scanning (month,day expr index).
create index idx_customers_birthday_md on public.customers (
  extract(month from birthday), extract(day from birthday)
) where birthday is not null;

-- ── Rank history ─────────────────────────────────────────────────────────────
create table public.customer_rank_history (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references public.customers (id) on delete cascade,
  previous_tier_id    uuid references public.customer_tiers (id) on delete set null,
  new_tier_id         uuid not null references public.customer_tiers (id),
  reason              text not null default 'auto' check (reason in ('auto','manual')),
  qualifying_snapshot jsonb not null default '{}'::jsonb,  -- {lifetime_spend_cents, order_count, ...}
  changed_by          uuid references public.users (id) on delete set null,
  created_at          timestamptz not null default now()
);
create index idx_rank_history_customer on public.customer_rank_history (customer_id, created_at desc);
create index idx_rank_history_created on public.customer_rank_history (created_at desc);

-- ── Vouchers ─────────────────────────────────────────────────────────────────
create table public.vouchers (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,
  type                 text not null check (type in ('percentage','fixed','free_shipping')),
  value_percent        numeric(5,2),                -- for type=percentage
  value_cents          bigint,                      -- for type=fixed
  start_date           date not null default current_date,
  end_date             date,
  usage_limit          integer,                     -- null = unlimited
  used_count           integer not null default 0,
  assigned_customer_id uuid references public.customers (id) on delete cascade,  -- null = generic
  source               text not null default 'manual'
                       check (source in ('manual','automatic','birthday','rank_upgrade','promotional')),
  -- Idempotency key for engine-issued vouchers (e.g. 'rank_upgrade:<cust>:<tier>').
  dedupe_key           text unique,
  is_active            boolean not null default true,
  created_by           uuid references public.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (type <> 'percentage' or value_percent is not null),
  check (type <> 'fixed' or value_cents is not null)
);
create index idx_vouchers_customer on public.vouchers (assigned_customer_id);
create index idx_vouchers_source on public.vouchers (source);
create index idx_vouchers_end_date on public.vouchers (end_date);
create index idx_vouchers_created_keyset on public.vouchers (created_at desc, id desc);
create trigger trg_vouchers_updated before update on public.vouchers
  for each row execute function public.set_updated_at();

create table public.voucher_redemptions (
  id                      uuid primary key default gen_random_uuid(),
  voucher_id              uuid not null references public.vouchers (id) on delete cascade,
  customer_id             uuid not null references public.customers (id) on delete cascade,
  order_id                uuid references public.orders (id) on delete set null,
  amount_discounted_cents bigint not null default 0,
  created_at              timestamptz not null default now(),
  unique (voucher_id, order_id)              -- an order can redeem a voucher once
);
create index idx_redemptions_voucher on public.voucher_redemptions (voucher_id);
create index idx_redemptions_customer on public.voucher_redemptions (customer_id);

-- ── Segments (reusable saved filters for CRM + Marketing) ────────────────────
create table public.customer_segments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  filter      jsonb not null default '{}'::jsonb,
  -- {spend_min_cents, spend_max_cents, order_count_min, tier_keys[], last_purchase_before/after, regions[], product_id}
  created_by  uuid references public.users (id) on delete set null,
  is_active   boolean not null default true,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_customer_segments_updated before update on public.customer_segments
  for each row execute function public.set_updated_at();

-- ════════════════════════ TIER + AGGREGATE ENGINE ═══════════════════════════

-- Pick the best tier a customer qualifies for. Pure function of aggregates +
-- the (Settings-editable) customer_tiers thresholds.
create or replace function public.best_tier_for(
  p_lifetime_cents bigint,
  p_annual_cents   bigint,
  p_order_count    integer,
  p_score          numeric
) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.customer_tiers t
  where t.is_active
    and p_lifetime_cents >= t.lifetime_spend_threshold_cents
    and (t.annual_spend_threshold_cents is null or p_annual_cents >= t.annual_spend_threshold_cents)
    and (t.min_order_count is null or p_order_count >= t.min_order_count)
    and (t.min_customer_score is null or p_score >= t.min_customer_score)
  order by t.rank desc
  limit 1;
$$;

-- IDEMPOTENT tier evaluation: re-running with unchanged aggregates is a no-op.
-- Only UPGRADES automatically (downgrades are a manual/admin decision).
-- Returns the rank-history row when a change happened, else nulls.
create or replace function public.evaluate_customer_tier(p_customer_id uuid)
returns table (changed boolean, previous_tier_id uuid, new_tier_id uuid, history_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_best uuid;
  v_best_rank integer;
  v_cur_rank integer;
  v_hist uuid;
begin
  select * into c from public.customers where id = p_customer_id for update;
  if c.id is null then
    raise exception 'Customer % not found', p_customer_id;
  end if;

  v_best := public.best_tier_for(c.lifetime_spend_cents, c.annual_spend_cents, c.order_count, c.customer_score);
  if v_best is null or v_best = c.current_tier_id then
    return query select false, c.current_tier_id, c.current_tier_id, null::uuid;
    return;
  end if;

  select rank into v_best_rank from public.customer_tiers where id = v_best;
  v_cur_rank := coalesce((select rank from public.customer_tiers where id = c.current_tier_id), -1);
  if v_best_rank <= v_cur_rank then
    -- Qualifies only for a lower/equal tier: keep current (no auto-downgrade).
    return query select false, c.current_tier_id, c.current_tier_id, null::uuid;
    return;
  end if;

  update public.customers set current_tier_id = v_best where id = p_customer_id;

  insert into public.customer_rank_history
    (customer_id, previous_tier_id, new_tier_id, reason, qualifying_snapshot, changed_by)
  values
    (p_customer_id, c.current_tier_id, v_best, 'auto',
     jsonb_build_object(
       'lifetime_spend_cents', c.lifetime_spend_cents,
       'annual_spend_cents', c.annual_spend_cents,
       'order_count', c.order_count,
       'customer_score', c.customer_score),
     auth.uid())
  returning id into v_hist;

  return query select true, c.current_tier_id, v_best, v_hist;
end;
$$;
grant execute on function public.evaluate_customer_tier(uuid) to authenticated, service_role;

-- O(1) incremental aggregate update when an order becomes Delivered + Paid.
-- IDEMPOTENT: stamps orders.crm_applied_at and refuses to double-count.
-- Returns the tier-evaluation result so the caller can fire notifications/vouchers.
alter table public.orders add column crm_applied_at timestamptz;

create or replace function public.apply_order_to_crm(p_order_id uuid)
returns table (applied boolean, customer_id uuid, tier_changed boolean,
               previous_tier_id uuid, new_tier_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  o record;
  t record;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    raise exception 'Order % not found', p_order_id;
  end if;
  if o.crm_applied_at is not null then
    return query select false, o.customer_id, false, null::uuid, null::uuid;  -- already applied
    return;
  end if;
  if o.status <> 'delivered' or o.payment_status <> 'paid' then
    return query select false, o.customer_id, false, null::uuid, null::uuid;
    return;
  end if;

  update public.customers set
    lifetime_spend_cents = lifetime_spend_cents + o.total_cents,
    annual_spend_cents   = case
      when last_purchase_date is not null
       and extract(year from last_purchase_date) = extract(year from current_date)
      then annual_spend_cents + o.total_cents
      else o.total_cents          -- first purchase this year resets the annual window
    end,
    order_count          = order_count + 1,
    last_purchase_date   = greatest(coalesce(last_purchase_date, current_date), current_date),
    customer_score       = customer_score + (o.total_cents / 100.0) * 0.01 + 1  -- 1pt/order + 1pt/$100
  where id = o.customer_id;

  update public.orders set crm_applied_at = now() where id = p_order_id;

  select * into t from public.evaluate_customer_tier(o.customer_id);
  return query select true, o.customer_id, t.changed, t.previous_tier_id, t.new_tier_id;
end;
$$;
grant execute on function public.apply_order_to_crm(uuid) to authenticated, service_role;

-- Scheduled reconciliation (safety net): recompute one batch of customers'
-- aggregates from source data. Run via pg_cron/cron endpoint off-peak.
create or replace function public.reconcile_customer_aggregates(p_limit integer default 1000)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  with target as (
    select c.id from public.customers c
    order by c.updated_at asc
    limit p_limit
  ),
  agg as (
    select o.customer_id,
           sum(o.total_cents) as lifetime,
           sum(o.total_cents) filter (where extract(year from o.buying_date) = extract(year from current_date)) as annual,
           count(*) as cnt,
           max(o.buying_date) as last_buy
    from public.orders o
    where o.customer_id in (select id from target)
      and o.crm_applied_at is not null
    group by o.customer_id
  )
  update public.customers c set
    lifetime_spend_cents = coalesce(a.lifetime, 0),
    annual_spend_cents   = coalesce(a.annual, 0),
    order_count          = coalesce(a.cnt, 0),
    last_purchase_date   = a.last_buy
  from target t
  left join agg a on a.customer_id = t.id
  where c.id = t.id
    and (c.lifetime_spend_cents is distinct from coalesce(a.lifetime, 0)
      or c.order_count is distinct from coalesce(a.cnt, 0));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function public.reconcile_customer_aggregates(integer) to service_role;

-- ── Voucher validation + redemption (SERVER-SIDE enforcement) ────────────────
create or replace function public.redeem_voucher(
  p_code        text,
  p_customer_id uuid,
  p_order_id    uuid,
  p_order_total_cents bigint
) returns table (redemption_id uuid, discount_cents bigint, voucher_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v record;
  v_discount bigint;
  v_rid uuid;
begin
  select * into v from public.vouchers where code = p_code for update;
  if v.id is null then raise exception 'Invalid voucher code'; end if;
  if not v.is_active then raise exception 'Voucher is inactive'; end if;
  if v.start_date > current_date then raise exception 'Voucher not yet valid'; end if;
  if v.end_date is not null and v.end_date < current_date then raise exception 'Voucher expired'; end if;
  if v.usage_limit is not null and v.used_count >= v.usage_limit then
    raise exception 'Voucher usage limit reached';
  end if;
  if v.assigned_customer_id is not null and v.assigned_customer_id <> p_customer_id then
    raise exception 'Voucher is assigned to another customer';
  end if;

  v_discount := case v.type
    when 'percentage'    then (p_order_total_cents * v.value_percent / 100.0)::bigint
    when 'fixed'         then least(v.value_cents, p_order_total_cents)
    when 'free_shipping' then 0
  end;

  insert into public.voucher_redemptions (voucher_id, customer_id, order_id, amount_discounted_cents)
  values (v.id, p_customer_id, p_order_id, v_discount)
  returning id into v_rid;

  update public.vouchers set used_count = used_count + 1 where id = v.id;

  return query select v_rid, v_discount, v.id;
end;
$$;
grant execute on function public.redeem_voucher(text, uuid, uuid, bigint) to authenticated, service_role;

-- ════════════════════════ GRANTS + RLS ══════════════════════════════════════
grant select on public.customer_tiers, public.tier_benefits,
  public.customer_rank_history, public.voucher_redemptions to authenticated;
grant select, insert, update on public.vouchers, public.customer_segments to authenticated;
grant update on public.customer_tiers, public.tier_benefits to authenticated;
grant insert on public.customer_rank_history to authenticated;

alter table public.customer_tiers       enable row level security;
alter table public.tier_benefits        enable row level security;
alter table public.customer_rank_history enable row level security;
alter table public.vouchers             enable row level security;
alter table public.voucher_redemptions  enable row level security;
alter table public.customer_segments    enable row level security;

-- Tiers/benefits: everyone reads (badges everywhere); admin edits (crm.manage_tiers).
create policy tiers_select on public.customer_tiers for select to authenticated using (true);
create policy tiers_update on public.customer_tiers for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy benefits_select on public.tier_benefits for select to authenticated using (true);
create policy benefits_update on public.tier_benefits for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Rank history: read all (crm.view); manual overrides insert admin-only
-- (auto rows come from the SECURITY DEFINER engine).
create policy rank_history_select on public.customer_rank_history for select to authenticated using (true);
create policy rank_history_insert on public.customer_rank_history for insert to authenticated
  with check (public.is_admin());

-- Vouchers: read all; admin creates/edits (vouchers.create).
create policy vouchers_select on public.vouchers for select to authenticated using (true);
create policy vouchers_insert on public.vouchers for insert to authenticated with check (public.is_admin());
create policy vouchers_update on public.vouchers for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Redemptions: read all; writes only via redeem_voucher() (no insert policy).
create policy redemptions_select on public.voucher_redemptions for select to authenticated using (true);

-- Segments: read all; admin manages.
create policy segments_select on public.customer_segments for select to authenticated using (true);
create policy segments_insert on public.customer_segments for insert to authenticated with check (public.is_admin());
create policy segments_update on public.customer_segments for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ════════════════════════ TIER SEED (15 tiers + benefits) ═══════════════════
-- Default thresholds per spec: Bronze 0+, Silver 1k+, Gold 5k+, Platinum 10k+,
-- Diamond 50k+, Black Diamond 100k+ (lifetime spend, in cents). Sub-tier
-- defaults interpolate within each band. ALL editable in Settings → Loyalty.
insert into public.customer_tiers
  (key, name, group_name, rank, badge_color, lifetime_spend_threshold_cents) values
  ('bronze',                  'Bronze',                  'Bronze',        10, 'amber',        0),
  ('silver',                  'Silver',                  'Silver',        20, 'slate',     100000),
  ('gold',                    'Gold',                    'Gold',          30, 'amber',     500000),
  ('standard_platinum',       'Standard Platinum',       'Platinum',      40, 'slate',    1000000),
  ('elite_platinum',          'Elite Platinum',          'Platinum',      50, 'slate',    2000000),
  ('premier_platinum',        'Premier Platinum',        'Platinum',      60, 'slate',    3000000),
  ('signature_platinum',      'Signature Platinum',      'Platinum',      70, 'slate',    4000000),
  ('standard_diamond',        'Standard Diamond',        'Diamond',       80, 'blue',     5000000),
  ('elite_diamond',           'Elite Diamond',           'Diamond',       90, 'blue',     6500000),
  ('premier_diamond',         'Premier Diamond',         'Diamond',      100, 'blue',     8000000),
  ('signature_diamond',       'Signature Diamond',       'Diamond',      110, 'blue',     9000000),
  ('standard_black_diamond',  'Standard Black Diamond',  'Black Diamond',120, 'violet',  10000000),
  ('elite_black_diamond',     'Elite Black Diamond',     'Black Diamond',130, 'violet',  20000000),
  ('premier_black_diamond',   'Premier Black Diamond',   'Black Diamond',140, 'violet',  35000000),
  ('signature_black_diamond', 'Signature Black Diamond', 'Black Diamond',150, 'violet',  50000000)
on conflict (key) do nothing;

-- Escalating default benefits (editable per tier in Settings).
insert into public.tier_benefits
  (tier_id, discount_percent, voucher_amount_cents, free_shipping, priority_support, exclusive_promotions, cashback_percent)
select t.id,
  case t.group_name when 'Bronze' then 0 when 'Silver' then 2 when 'Gold' then 5
                    when 'Platinum' then 7.5 when 'Diamond' then 10 else 15 end,
  case t.group_name when 'Bronze' then 0 when 'Silver' then 500 when 'Gold' then 2500
                    when 'Platinum' then 5000 when 'Diamond' then 15000 else 50000 end,
  t.group_name in ('Gold','Platinum','Diamond','Black Diamond'),
  t.group_name in ('Platinum','Diamond','Black Diamond'),
  t.group_name in ('Gold','Platinum','Diamond','Black Diamond'),
  case t.group_name when 'Diamond' then 1 when 'Black Diamond' then 2 else 0 end
from public.customer_tiers t
on conflict (tier_id) do nothing;

-- Existing customers start at Bronze.
update public.customers
  set current_tier_id = (select id from public.customer_tiers where key = 'bronze')
  where current_tier_id is null;
