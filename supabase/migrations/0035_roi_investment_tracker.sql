-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  MODULE 15 — ROI & Investment Recovery Tracker.                            ║
-- ║                                                                            ║
-- ║  Tracks investments, a per-period cash-flow ledger (capital/revenue/cost), ║
-- ║  and the recovery of capital over time. Mirrors the Module 4 inventory     ║
-- ║  discipline: the ledger (investment_cash_flows) is the SINGLE source of    ║
-- ║  truth; every headline number on investments is maintained O(1) INSIDE the ║
-- ║  writing transaction by apply_investment_cash_flow() (lock → write ledger  ║
-- ║  → bump aggregates → upsert monthly rollup). Direct edits to the aggregate ║
-- ║  columns are forbidden at the privilege level (column-scoped UPDATE grant);║
-- ║  reconcile_investment_aggregates() is the nightly backstop.                ║
-- ║                                                                            ║
-- ║  MONEY: ×100 bigint cents (main-ledger convention, like inventory/orders). ║
-- ║  FORMULAS (spec, divide-by-zero guarded): with I=Σcapital, R=Σrevenue,     ║
-- ║  C=Σcost — Recovered = Total Profit = R−C; Recovery% = min(100,(R−C)/I·100);║
-- ║  ROI% = ((R−C)−I)/I·100; Remaining = max(0, I−(R−C)). All 0 when I=0.       ║
-- ║                                                                            ║
-- ║  Portfolio/category/project KPI matviews fold into the existing 5-minute   ║
-- ║  pg_cron refresh (refresh_analytics_views) — never a live scan; served via ║
-- ║  the service role behind roi.view. Per-month cumulatives come from the     ║
-- ║  security_invoker view v_investment_monthly over the incrementally-        ║
-- ║  maintained raw rollup (avoids incremental-cumulative drift on backdated   ║
-- ║  entries).                                                                 ║
-- ║                                                                            ║
-- ║  PERMISSIONS: MUST stay in sync with src/lib/rbac/permissions.ts.          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create extension if not exists pg_cron;
create extension if not exists pg_trgm;

-- ── 1. Permission matrix (mirror of src/lib/rbac/permissions.ts) ──────────────
insert into public.permissions (key, description, module) values
  ('roi.view',          'View ROI & investment recovery',                'roi'),
  ('roi.create',        'Create investments and add ledger entries',     'roi'),
  ('roi.edit',          'Edit investments and ledger entries',           'roi'),
  ('roi.delete',        'Delete investments and ledger entries',         'roi'),
  ('roi.manage',        'Manage ROI categories, projects and config',    'roi'),
  ('settings.edit_roi', 'Edit ROI / investment configuration',           'settings')
on conflict (key) do update set description = excluded.description, module = excluded.module;

-- Admin gets everything (catch-up). Staff get NONE by default — sensitive
-- company financials, scoped like Module 6 Profit. Grant roi.view manually to
-- scope a staff member to their own/assigned investments (RLS enforces it).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'admin'
on conflict do nothing;

-- ── 2. Reference lists (the filter dimensions — real tables, FK targets) ──────
create table public.investment_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  color       text not null default 'slate',
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index uq_investment_categories_name
  on public.investment_categories (lower(name)) where deleted_at is null;
create trigger trg_investment_categories_updated before update on public.investment_categories
  for each row execute function public.set_updated_at();

create table public.investment_projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  color       text not null default 'slate',
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index uq_investment_projects_name
  on public.investment_projects (lower(name)) where deleted_at is null;
create trigger trg_investment_projects_updated before update on public.investment_projects
  for each row execute function public.set_updated_at();

-- Config lists: readable by all authenticated (they're just labels for the
-- filters); Admin-managed writes only — same as printers/materials.
grant select, insert, update on public.investment_categories to authenticated;
grant select, insert, update on public.investment_projects to authenticated;
alter table public.investment_categories enable row level security;
alter table public.investment_projects enable row level security;
create policy inv_cat_select on public.investment_categories for select to authenticated using (true);
create policy inv_cat_write  on public.investment_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy inv_proj_select on public.investment_projects for select to authenticated using (true);
create policy inv_proj_write  on public.investment_projects for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── 3. investments (parent — carries the incrementally-maintained headline) ───
create table public.investments (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null check (length(trim(name)) > 0),
  category_id              uuid references public.investment_categories (id) on delete set null,
  project_id               uuid references public.investment_projects (id) on delete set null,
  description              text,
  notes                    text,
  start_date               date not null default current_date,
  expected_payback_months  integer check (expected_payback_months is null or expected_payback_months >= 0),
  status                   text not null default 'active',  -- lifecycle (configurable)
  created_by               uuid references public.users (id) on delete set null,
  updated_by               uuid references public.users (id) on delete set null,
  assigned_to              uuid references public.users (id) on delete set null,
  -- Headline aggregates (cents) — maintained ONLY by apply_investment_cash_flow
  -- + reconcile. Not in the column-level UPDATE/INSERT grant below, so direct
  -- PostgREST writes cannot tamper with them.
  total_capital_cents      bigint not null default 0,   -- I = Σ capital
  total_revenue_cents      bigint not null default 0,   -- R
  total_cost_cents         bigint not null default 0,   -- C
  recovered_cents          bigint not null default 0,   -- R − C (= Total Profit)
  remaining_cents          bigint not null default 0,   -- max(0, I − (R−C))
  roi_pct                  numeric not null default 0,  -- ((R−C)−I)/I·100
  recovery_pct             numeric not null default 0,  -- min(100,(R−C)/I·100)
  break_even_status        text not null default 'pending', -- pending|in_progress|recovered|underperforming
  break_even_at            timestamptz,                 -- when it first crossed (nullable)
  last_activity_at         timestamptz,
  is_active                boolean not null default true,
  deleted_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create trigger trg_investments_updated before update on public.investments
  for each row execute function public.set_updated_at();

-- Keyset rule: every sortable column needs a composite (sort_col, id) index.
create index idx_investments_created  on public.investments (created_at desc, id) where deleted_at is null;
create index idx_investments_roi       on public.investments (roi_pct, id)        where deleted_at is null;
create index idx_investments_recovery  on public.investments (recovery_pct, id)   where deleted_at is null;
create index idx_investments_capital   on public.investments (total_capital_cents, id) where deleted_at is null;
create index idx_investments_name      on public.investments (name, id)           where deleted_at is null;
-- Schema-qualify the trgm operator class: Supabase keeps pg_trgm in the
-- `extensions` schema, which isn't on the migration runner's search_path.
create index idx_investments_name_trgm on public.investments using gin (name extensions.gin_trgm_ops);
create index idx_investments_category  on public.investments (category_id);
create index idx_investments_project   on public.investments (project_id);
create index idx_investments_created_by on public.investments (created_by);
create index idx_investments_assigned  on public.investments (assigned_to);
create index idx_investments_bestatus  on public.investments (break_even_status);
create index idx_investments_cat_status on public.investments (category_id, status);

alter table public.investments enable row level security;
-- Read: admin sees all; a staff member granted roi.view sees only investments
-- they created or are assigned to. Single key, so AND the ownership branch
-- (do NOT grant all rows on has_permission alone).
create policy investments_select on public.investments for select to authenticated
  using (
    public.is_admin()
    or (public.has_permission('roi.view')
        and (created_by = auth.uid() or assigned_to = auth.uid()))
  );
create policy investments_insert on public.investments for insert to authenticated
  with check (public.has_permission('roi.create') and created_by = auth.uid());
create policy investments_update on public.investments for update to authenticated
  using (
    public.is_admin()
    or (public.has_permission('roi.edit')
        and (created_by = auth.uid() or assigned_to = auth.uid()))
  )
  with check (
    public.is_admin()
    or (public.has_permission('roi.edit')
        and (created_by = auth.uid() or assigned_to = auth.uid()))
  );
-- Column-scoped grants: SELECT all; INSERT/UPDATE only the human-editable
-- columns — the headline aggregates are writable solely by the SECURITY DEFINER
-- RPC (which runs as the table owner and bypasses these grants).
grant select on public.investments to authenticated;
grant insert (name, category_id, project_id, description, notes, start_date,
              expected_payback_months, status, assigned_to, created_by)
  on public.investments to authenticated;
grant update (name, category_id, project_id, description, notes, start_date,
              expected_payback_months, status, assigned_to, updated_by,
              is_active, deleted_at)
  on public.investments to authenticated;

-- ── 4. investment_cash_flows (the per-period ledger — single source of truth) ─
create table public.investment_cash_flows (
  id              uuid primary key default gen_random_uuid(),
  investment_id   uuid not null references public.investments (id) on delete cascade,
  flow_type       text not null check (flow_type in ('capital', 'revenue', 'cost')),
  amount_cents    bigint not null check (amount_cents > 0),
  entry_date      date not null default current_date,
  period_month    date not null,  -- date_trunc('month', entry_date)::date
  notes           text,
  source          text not null default 'manual' check (source in ('manual', 'order')),
  reference_type  text,           -- reserved for v2 order auto-attribution
  reference_id    uuid,
  created_by      uuid references public.users (id) on delete set null,
  is_active       boolean not null default true,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index idx_inv_cf_investment   on public.investment_cash_flows (investment_id, entry_date desc, id);
create index idx_inv_cf_period        on public.investment_cash_flows (investment_id, period_month);
create index idx_inv_cf_period_only   on public.investment_cash_flows (period_month);
create index idx_inv_cf_source_order  on public.investment_cash_flows (reference_id) where reference_id is not null;

-- Reads scoped to the parent investment's visibility; writes flow ONLY through
-- the RPC (no insert/update grant or policy).
grant select on public.investment_cash_flows to authenticated;
alter table public.investment_cash_flows enable row level security;
create policy inv_cf_select on public.investment_cash_flows for select to authenticated
  using (exists (
    select 1 from public.investments i
    where i.id = investment_id
      and (public.is_admin()
           or (public.has_permission('roi.view')
               and (i.created_by = auth.uid() or i.assigned_to = auth.uid())))
  ));

-- ── 5. investment_monthly_rollup (raw per-month aggregates, O(1) upsert) ───────
create table public.investment_monthly_rollup (
  id             uuid primary key default gen_random_uuid(),  -- keyset tiebreaker
  investment_id  uuid not null references public.investments (id) on delete cascade,
  period_month   date not null,
  capital_cents  bigint not null default 0,
  revenue_cents  bigint not null default 0,
  cost_cents     bigint not null default 0,
  updated_at     timestamptz not null default now(),
  unique (investment_id, period_month)
);
create index idx_inv_rollup_period on public.investment_monthly_rollup (period_month, id);
create index idx_inv_rollup_inv_period on public.investment_monthly_rollup (investment_id, period_month, id);

grant select on public.investment_monthly_rollup to authenticated;
alter table public.investment_monthly_rollup enable row level security;
create policy inv_rollup_select on public.investment_monthly_rollup for select to authenticated
  using (exists (
    select 1 from public.investments i
    where i.id = investment_id
      and (public.is_admin()
           or (public.has_permission('roi.view')
               and (i.created_by = auth.uid() or i.assigned_to = auth.uid())))
  ));

-- ── 6. Monthly analysis view (cumulatives via window fns; RLS of the rollup) ──
-- security_invoker = true → runs as the querying user, so the rollup's RLS
-- applies (no leak). Powers the monthly DataTable + the per-investment charts.
create view public.v_investment_monthly with (security_invoker = true) as
select
  r.id,
  r.investment_id,
  r.period_month,
  r.capital_cents,
  r.revenue_cents,
  r.cost_cents,
  (r.revenue_cents - r.cost_cents)                                   as profit_cents,
  sum(r.capital_cents) over w                                        as cumulative_invested_cents,
  sum(r.revenue_cents - r.cost_cents) over w                         as cumulative_profit_cents,
  greatest(0, sum(r.capital_cents) over w
              - sum(r.revenue_cents - r.cost_cents) over w)          as remaining_recovery_cents,
  case when sum(r.capital_cents) over w = 0 then 0
       else round((sum(r.revenue_cents - r.cost_cents) over w - sum(r.capital_cents) over w)::numeric
                  / sum(r.capital_cents) over w * 100, 2) end        as roi_to_date_pct,
  case when sum(r.capital_cents) over w = 0 then 0
       else round(least(100, (sum(r.revenue_cents - r.cost_cents) over w)::numeric
                  / (sum(r.capital_cents) over w) * 100), 2) end     as recovery_to_date_pct
from public.investment_monthly_rollup r
window w as (partition by r.investment_id order by r.period_month
            rows between unbounded preceding and current row);
grant select on public.v_investment_monthly to authenticated;

-- ── 7. Write-path RPC — the ONLY way numbers enter (clone of inventory RPC) ───
create or replace function public.apply_investment_cash_flow(
  p_investment_id uuid,
  p_flow_type     text,
  p_amount_cents  bigint,
  p_entry_date    date default current_date,
  p_notes         text default null,
  p_source        text default 'manual',
  p_reference_type text default null,
  p_reference_id  uuid default null
) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare
  v_cap   bigint;
  v_rev   bigint;
  v_cost  bigint;
  v_be_at timestamptz;
  v_recovered bigint;
  v_status text;
  v_month date := date_trunc('month', p_entry_date)::date;
  v_id    uuid;
begin
  perform public.assert_any_permission('roi.create', 'roi.edit', 'roi.manage');

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Cash-flow amount must be a positive number of cents';
  end if;
  if p_flow_type not in ('capital', 'revenue', 'cost') then
    raise exception 'Invalid flow type %', p_flow_type;
  end if;

  -- Serialize concurrent writers for this investment.
  select total_capital_cents, total_revenue_cents, total_cost_cents, break_even_at
    into v_cap, v_rev, v_cost, v_be_at
    from public.investments where id = p_investment_id for update;
  if not found then
    raise exception 'Investment % not found', p_investment_id;
  end if;

  insert into public.investment_cash_flows
    (investment_id, flow_type, amount_cents, entry_date, period_month, notes,
     source, reference_type, reference_id, created_by)
  values
    (p_investment_id, p_flow_type, p_amount_cents, p_entry_date, v_month, p_notes,
     coalesce(p_source, 'manual'), p_reference_type, p_reference_id, auth.uid())
  returning id into v_id;

  if    p_flow_type = 'capital' then v_cap  := v_cap  + p_amount_cents;
  elsif p_flow_type = 'revenue' then v_rev  := v_rev  + p_amount_cents;
  else                               v_cost := v_cost + p_amount_cents;
  end if;

  v_recovered := v_rev - v_cost;
  if v_cap = 0 then
    v_status := 'pending';
  elsif v_recovered >= v_cap then
    v_status := 'recovered';
  elsif v_recovered <= 0 then
    v_status := 'underperforming';
  else
    v_status := 'in_progress';
  end if;
  if v_status = 'recovered' and v_be_at is null then
    v_be_at := now();
  end if;

  update public.investments set
    total_capital_cents = v_cap,
    total_revenue_cents = v_rev,
    total_cost_cents    = v_cost,
    recovered_cents     = v_recovered,
    remaining_cents     = greatest(0, v_cap - v_recovered),
    roi_pct      = case when v_cap = 0 then 0 else round((v_recovered - v_cap)::numeric / v_cap * 100, 2) end,
    recovery_pct = case when v_cap = 0 then 0 else round(least(100, v_recovered::numeric / v_cap * 100), 2) end,
    break_even_status = v_status,
    break_even_at     = v_be_at,
    last_activity_at  = now()
  where id = p_investment_id;

  insert into public.investment_monthly_rollup
    (investment_id, period_month, capital_cents, revenue_cents, cost_cents)
  values (p_investment_id, v_month,
          case when p_flow_type = 'capital' then p_amount_cents else 0 end,
          case when p_flow_type = 'revenue' then p_amount_cents else 0 end,
          case when p_flow_type = 'cost'    then p_amount_cents else 0 end)
  on conflict (investment_id, period_month) do update set
    capital_cents = public.investment_monthly_rollup.capital_cents + excluded.capital_cents,
    revenue_cents = public.investment_monthly_rollup.revenue_cents + excluded.revenue_cents,
    cost_cents    = public.investment_monthly_rollup.cost_cents    + excluded.cost_cents,
    updated_at    = now();

  return v_id;
end;
$$;
grant execute on function public.apply_investment_cash_flow(uuid, text, bigint, date, text, text, text, uuid)
  to authenticated, service_role;
revoke execute on function public.apply_investment_cash_flow(uuid, text, bigint, date, text, text, text, uuid)
  from public, anon;

-- ── 8. Soft-delete + reverse a ledger entry (same lock, in one txn) ───────────
create or replace function public.delete_investment_cash_flow(p_id uuid)
returns boolean
language plpgsql security definer set search_path to 'public' as $$
declare
  v_inv   uuid;
  v_type  text;
  v_amt   bigint;
  v_month date;
  v_cap bigint; v_rev bigint; v_cost bigint; v_recovered bigint; v_status text; v_be_at timestamptz;
begin
  perform public.assert_any_permission('roi.delete', 'roi.edit', 'roi.manage');

  select investment_id, flow_type, amount_cents, period_month
    into v_inv, v_type, v_amt, v_month
    from public.investment_cash_flows
    where id = p_id and deleted_at is null;
  if not found then
    return false;  -- already gone / never existed → idempotent
  end if;

  -- Lock the parent and read current aggregates.
  select total_capital_cents, total_revenue_cents, total_cost_cents, break_even_at
    into v_cap, v_rev, v_cost, v_be_at
    from public.investments where id = v_inv for update;

  update public.investment_cash_flows
    set deleted_at = now(), is_active = false
    where id = p_id and deleted_at is null;

  if    v_type = 'capital' then v_cap  := v_cap  - v_amt;
  elsif v_type = 'revenue' then v_rev  := v_rev  - v_amt;
  else                          v_cost := v_cost - v_amt;
  end if;

  v_recovered := v_rev - v_cost;
  if v_cap = 0 then v_status := 'pending';
  elsif v_recovered >= v_cap then v_status := 'recovered';
  elsif v_recovered <= 0 then v_status := 'underperforming';
  else v_status := 'in_progress'; end if;
  if v_status <> 'recovered' then v_be_at := null; end if;  -- crossed back below

  update public.investments set
    total_capital_cents = v_cap,
    total_revenue_cents = v_rev,
    total_cost_cents    = v_cost,
    recovered_cents     = v_recovered,
    remaining_cents     = greatest(0, v_cap - v_recovered),
    roi_pct      = case when v_cap = 0 then 0 else round((v_recovered - v_cap)::numeric / v_cap * 100, 2) end,
    recovery_pct = case when v_cap = 0 then 0 else round(least(100, v_recovered::numeric / v_cap * 100), 2) end,
    break_even_status = v_status,
    break_even_at     = v_be_at,
    last_activity_at  = now()
  where id = v_inv;

  update public.investment_monthly_rollup set
    capital_cents = capital_cents - case when v_type = 'capital' then v_amt else 0 end,
    revenue_cents = revenue_cents - case when v_type = 'revenue' then v_amt else 0 end,
    cost_cents    = cost_cents    - case when v_type = 'cost'    then v_amt else 0 end,
    updated_at    = now()
  where investment_id = v_inv and period_month = v_month;

  return true;
end;
$$;
grant execute on function public.delete_investment_cash_flow(uuid) to authenticated, service_role;
revoke execute on function public.delete_investment_cash_flow(uuid) from public, anon;

-- ── 9. Nightly reconciliation backstop (recompute from the ledger) ────────────
create or replace function public.reconcile_investment_aggregates(p_limit integer default 1000)
returns integer
language plpgsql security definer set search_path to 'public' as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    select id from public.investments where deleted_at is null order by updated_at asc limit p_limit
  loop
    with agg as (
      select
        coalesce(sum(amount_cents) filter (where flow_type = 'capital'), 0) as cap,
        coalesce(sum(amount_cents) filter (where flow_type = 'revenue'), 0) as rev,
        coalesce(sum(amount_cents) filter (where flow_type = 'cost'),    0) as cost
      from public.investment_cash_flows
      where investment_id = r.id and deleted_at is null
    )
    update public.investments inv set
      total_capital_cents = agg.cap,
      total_revenue_cents = agg.rev,
      total_cost_cents    = agg.cost,
      recovered_cents     = agg.rev - agg.cost,
      remaining_cents     = greatest(0, agg.cap - (agg.rev - agg.cost)),
      roi_pct      = case when agg.cap = 0 then 0 else round(((agg.rev - agg.cost) - agg.cap)::numeric / agg.cap * 100, 2) end,
      recovery_pct = case when agg.cap = 0 then 0 else round(least(100, (agg.rev - agg.cost)::numeric / agg.cap * 100), 2) end,
      break_even_status = case
        when agg.cap = 0 then 'pending'
        when (agg.rev - agg.cost) >= agg.cap then 'recovered'
        when (agg.rev - agg.cost) <= 0 then 'underperforming'
        else 'in_progress' end
    from agg
    where inv.id = r.id
      and (inv.total_capital_cents, inv.total_revenue_cents, inv.total_cost_cents)
          is distinct from (agg.cap, agg.rev, agg.cost);

    -- Rebuild this investment's monthly rollup from the active ledger.
    delete from public.investment_monthly_rollup where investment_id = r.id;
    insert into public.investment_monthly_rollup (investment_id, period_month, capital_cents, revenue_cents, cost_cents)
    select investment_id, period_month,
      coalesce(sum(amount_cents) filter (where flow_type = 'capital'), 0),
      coalesce(sum(amount_cents) filter (where flow_type = 'revenue'), 0),
      coalesce(sum(amount_cents) filter (where flow_type = 'cost'),    0)
    from public.investment_cash_flows
    where investment_id = r.id and deleted_at is null
    group by investment_id, period_month;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
grant execute on function public.reconcile_investment_aggregates(integer) to service_role;
revoke execute on function public.reconcile_investment_aggregates(integer) from public, anon, authenticated;

-- ── 10. Portfolio / category / project KPI materialized views ─────────────────
create materialized view public.mv_roi_portfolio as
select
  1 as id,
  count(*)::bigint                                            as investment_count,
  coalesce(sum(total_capital_cents), 0)::bigint              as total_capital_cents,
  coalesce(sum(total_revenue_cents), 0)::bigint              as total_revenue_cents,
  coalesce(sum(total_cost_cents), 0)::bigint                 as total_cost_cents,
  coalesce(sum(recovered_cents), 0)::bigint                  as recovered_cents,
  coalesce(sum(remaining_cents), 0)::bigint                  as remaining_cents,
  case when coalesce(sum(total_capital_cents), 0) = 0 then 0
       else round((sum(recovered_cents) - sum(total_capital_cents))::numeric
                  / sum(total_capital_cents) * 100, 2) end   as roi_pct,
  case when coalesce(sum(total_capital_cents), 0) = 0 then 0
       else round(least(100, sum(recovered_cents)::numeric
                  / sum(total_capital_cents) * 100), 2) end  as recovery_pct,
  count(*) filter (where break_even_status = 'recovered')::bigint        as recovered_count,
  count(*) filter (where break_even_status in ('pending', 'in_progress'))::bigint as in_progress_count,
  count(*) filter (where break_even_status = 'underperforming')::bigint  as underperforming_count,
  now() as refreshed_at
from public.investments
where deleted_at is null and is_active;
create unique index uq_mv_roi_portfolio on public.mv_roi_portfolio (id);

create materialized view public.mv_roi_category as
select
  c.id                                                       as category_id,
  c.name                                                     as category_name,
  c.color                                                    as category_color,
  count(i.id)::bigint                                        as investment_count,
  coalesce(sum(i.total_capital_cents), 0)::bigint            as total_capital_cents,
  coalesce(sum(i.recovered_cents), 0)::bigint                as recovered_cents,
  coalesce(sum(i.remaining_cents), 0)::bigint                as remaining_cents,
  case when coalesce(sum(i.total_capital_cents), 0) = 0 then 0
       else round((sum(i.recovered_cents) - sum(i.total_capital_cents))::numeric
                  / sum(i.total_capital_cents) * 100, 2) end as roi_pct,
  case when coalesce(sum(i.total_capital_cents), 0) = 0 then 0
       else round(least(100, sum(i.recovered_cents)::numeric
                  / sum(i.total_capital_cents) * 100), 2) end as recovery_pct
from public.investment_categories c
left join public.investments i on i.category_id = c.id and i.deleted_at is null and i.is_active
where c.deleted_at is null
group by c.id, c.name, c.color;
create unique index uq_mv_roi_category on public.mv_roi_category (category_id);

create materialized view public.mv_roi_project as
select
  pr.id                                                      as project_id,
  pr.name                                                    as project_name,
  pr.color                                                   as project_color,
  count(i.id)::bigint                                        as investment_count,
  coalesce(sum(i.total_capital_cents), 0)::bigint            as total_capital_cents,
  coalesce(sum(i.recovered_cents), 0)::bigint                as recovered_cents,
  coalesce(sum(i.remaining_cents), 0)::bigint                as remaining_cents,
  case when coalesce(sum(i.total_capital_cents), 0) = 0 then 0
       else round((sum(i.recovered_cents) - sum(i.total_capital_cents))::numeric
                  / sum(i.total_capital_cents) * 100, 2) end as roi_pct,
  case when coalesce(sum(i.total_capital_cents), 0) = 0 then 0
       else round(least(100, sum(i.recovered_cents)::numeric
                  / sum(i.total_capital_cents) * 100), 2) end as recovery_pct
from public.investment_projects pr
left join public.investments i on i.project_id = pr.id and i.deleted_at is null and i.is_active
where pr.deleted_at is null
group by pr.id, pr.name, pr.color;
create unique index uq_mv_roi_project on public.mv_roi_project (project_id);

-- Same access pattern as the other analytics MVs: no API-role grants — read via
-- the service role AFTER the roi.view permission check.
revoke all on public.mv_roi_portfolio, public.mv_roi_category, public.mv_roi_project
  from anon, authenticated;

-- ── 11. Fold ROI views into the existing 5-minute refresh (append, NOT replace)
create or replace function public.refresh_analytics_views()
returns void language plpgsql security definer set search_path = public as $$
begin
  refresh materialized view concurrently public.mv_product_profitability;
  refresh materialized view concurrently public.mv_revenue_daily;
  refresh materialized view concurrently public.mv_printer_stats;
  refresh materialized view concurrently public.mv_material_stats;
  refresh materialized view concurrently public.mv_inventory_value;
  refresh materialized view concurrently public.mv_orders_daily;
  refresh materialized view concurrently public.mv_printer_daily;
  refresh materialized view concurrently public.mv_top_customers;
  refresh materialized view concurrently public.mv_summary_stats;
  refresh materialized view concurrently public.mv_feedback_daily;
  refresh materialized view concurrently public.mv_feedback_summary;
  refresh materialized view concurrently public.mv_feedback_products;
  refresh materialized view concurrently public.mv_feedback_staff;
  refresh materialized view concurrently public.mv_feedback_repeat_negative;
  refresh materialized view concurrently public.mv_roi_portfolio;
  refresh materialized view concurrently public.mv_roi_category;
  refresh materialized view concurrently public.mv_roi_project;
end;
$$;
-- (The existing pg_cron job calls refresh_analytics_views() every 5 min — do
--  NOT schedule a second job.)

-- ── 12. First fill (non-concurrent) so the first cron tick won't fail + reload ─
refresh materialized view public.mv_roi_portfolio;
refresh materialized view public.mv_roi_category;
refresh materialized view public.mv_roi_project;

notify pgrst, 'reload schema';
