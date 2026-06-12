-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Analytics (Module 10) — cached aggregates.                                ║
-- ║                                                                            ║
-- ║  mv_orders_daily is the workhorse: a small daily cube over                  ║
-- ║  (day × staff × status × priority). Every dashboard widget — orders over    ║
-- ║  time, status donut, priority bar, top staff, month-vs-month, and the      ║
-- ║  STAFF ROLE-SCOPE (assigned_staff_id = caller) — is a sum over this cube,  ║
-- ║  never a scan of the orders table. Revenue/cogs are carried only on        ║
-- ║  delivered+paid rows so revenue KPIs are a filtered sum of the same cube.  ║
-- ║                                                                            ║
-- ║  Like 0013: views are NOT granted to authenticated — the analytics API     ║
-- ║  enforces analytics.view / analytics.view_team server-side and reads via   ║
-- ║  the service role. Refresh: same pg_cron job, every 5 minutes.             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Daily orders cube ─────────────────────────────────────────────────────────
create materialized view public.mv_orders_daily as
select
  o.buying_date as day,
  o.assigned_staff_id,
  o.status,
  o.priority,
  count(*)::bigint as orders_count,
  -- Money only on delivered+paid rows: revenue KPIs = sum over those rows.
  count(*) filter (where o.status = 'delivered' and o.payment_status = 'paid')::bigint
    as paid_orders_count,
  sum(o.total_cents) filter (where o.status = 'delivered' and o.payment_status = 'paid')::bigint
    as revenue_cents,
  sum(o.material_cost_cents) filter (where o.status = 'delivered' and o.payment_status = 'paid')::bigint
    as material_cost_cents,
  sum(o.actual_print_minutes)::bigint as print_minutes
from public.orders o
where o.is_active
group by o.buying_date, o.assigned_staff_id, o.status, o.priority;

create unique index uq_mv_orders_daily
  on public.mv_orders_daily (day, assigned_staff_id, status, priority)
  nulls not distinct;
create index idx_mv_orders_daily_staff on public.mv_orders_daily (assigned_staff_id, day);

-- ── Per-printer daily utilization (orders + printing hours, date-filterable) ─
create materialized view public.mv_printer_daily as
select
  o.buying_date as day,
  o.printer_id,
  pr.brand,
  pr.model,
  pr.badge_color,
  count(*)::bigint as orders_count,
  sum(coalesce(o.actual_print_minutes, o.estimated_print_minutes, 0))::bigint as print_minutes
from public.orders o
join public.printers pr on pr.id = o.printer_id
where o.is_active and o.printer_id is not null
group by o.buying_date, o.printer_id, pr.brand, pr.model, pr.badge_color;

create unique index uq_mv_printer_daily on public.mv_printer_daily (day, printer_id);

-- ── Top customers snapshot (by incrementally-maintained aggregates) ──────────
create materialized view public.mv_top_customers as
select
  c.id as customer_id,
  c.name,
  c.lifetime_spend_cents,
  c.order_count,
  c.last_purchase_date,
  t.name as tier_name,
  t.badge_color as tier_color
from public.customers c
left join public.customer_tiers t on t.id = c.current_tier_id
where c.deleted_at is null and c.order_count > 0
order by c.lifetime_spend_cents desc
limit 200;

create unique index uq_mv_top_customers on public.mv_top_customers (customer_id);

-- ── One-row summary (figures that aren't date-range shaped) ──────────────────
-- NOTE: REFRESH ... CONCURRENTLY requires a unique index on plain COLUMNS
-- (expression indexes like ((1)) don't qualify — see 0017), hence the literal
-- id column on this single-row view.
create materialized view public.mv_summary_stats as
select
  1 as id,
  (select count(*) from public.customers
    where deleted_at is null
      and last_purchase_date >= current_date - 90)::bigint as active_customers_90d,
  (select count(*) from public.customers where deleted_at is null)::bigint as total_customers,
  now() as refreshed_at;

create unique index uq_mv_summary_stats on public.mv_summary_stats (id);

-- ── Fold the new views into the existing 5-minute refresh ────────────────────
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
end;
$$;
revoke execute on function public.refresh_analytics_views() from public, anon, authenticated;
grant execute on function public.refresh_analytics_views() to service_role;
