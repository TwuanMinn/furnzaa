-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Profit & Cost Analysis (spec v3, Module 4) — cached aggregates.           ║
-- ║                                                                            ║
-- ║  Formulas:                                                                 ║
-- ║    unit production cost = cost_price + labor + packaging + overhead        ║
-- ║                           (pure-purchase goods have zero components →      ║
-- ║                            falls back to cost_price alone)                 ║
-- ║    profit/unit  = selling price − production cost                          ║
-- ║    margin %     = profit ÷ selling price × 100                             ║
-- ║                                                                            ║
-- ║  Revenue counts DELIVERED + PAID orders only. ALL dashboard numbers read   ║
-- ║  these materialized views — never the raw multi-million-row tables.        ║
-- ║  Refresh: pg_cron every 5 min (and on demand via refresh_analytics_views). ║
-- ║  Access: views are NOT granted to authenticated — the API reads them via   ║
-- ║  the service role AFTER the profit.view permission check.                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create extension if not exists pg_cron;

-- ── Per-product profitability (all-time, delivered+paid) ─────────────────────
create materialized view public.mv_product_profitability as
select
  p.id as product_id,
  p.sku,
  p.name,
  p.status,
  pc.name as category_name,
  p.selling_price_cents,
  (p.cost_price_cents + p.labor_cost_cents + p.packaging_cost_cents + p.overhead_cost_cents)
    as production_cost_cents,
  (p.selling_price_cents
    - (p.cost_price_cents + p.labor_cost_cents + p.packaging_cost_cents + p.overhead_cost_cents))
    as profit_per_unit_cents,
  case when p.selling_price_cents > 0
    then round(
      (p.selling_price_cents
        - (p.cost_price_cents + p.labor_cost_cents + p.packaging_cost_cents + p.overhead_cost_cents)
      )::numeric * 100 / p.selling_price_cents, 2)
    else 0 end as margin_percent,
  coalesce(s.units_sold, 0) as units_sold,
  coalesce(s.revenue_cents, 0) as revenue_cents,
  coalesce(s.units_sold, 0)
    * (p.cost_price_cents + p.labor_cost_cents + p.packaging_cost_cents + p.overhead_cost_cents)
    as cogs_cents,
  coalesce(s.revenue_cents, 0)
    - coalesce(s.units_sold, 0)
      * (p.cost_price_cents + p.labor_cost_cents + p.packaging_cost_cents + p.overhead_cost_cents)
    as gross_profit_cents,
  s.last_sold_at
from public.products p
left join public.product_categories pc on pc.id = p.category_id
left join (
  select oi.product_id,
         sum(oi.quantity)::bigint as units_sold,
         sum(oi.line_total_cents)::bigint as revenue_cents,
         max(o.buying_date) as last_sold_at
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.status = 'delivered' and o.payment_status = 'paid' and o.is_active
    and oi.product_id is not null
  group by oi.product_id
) s on s.product_id = p.id
where p.deleted_at is null;

create unique index uq_mv_product_profitability on public.mv_product_profitability (product_id);
create index idx_mv_prod_profit_revenue on public.mv_product_profitability (revenue_cents desc);

-- ── Daily revenue vs cost (drives time series + date-range KPI math) ─────────
create materialized view public.mv_revenue_daily as
with order_days as (
  select
    o.buying_date as day,
    count(*)::bigint as orders_count,
    sum(o.total_cents)::bigint as revenue_cents,
    sum(o.discount_cents)::bigint as discount_cents,
    sum(o.material_cost_cents)::bigint as print_material_cost_cents,
    sum(o.actual_print_minutes)::bigint as print_minutes,
    sum(o.filament_used_grams)::numeric as filament_grams
  from public.orders o
  where o.status = 'delivered' and o.payment_status = 'paid' and o.is_active
  group by o.buying_date
),
cogs_days as (
  select
    o.buying_date as day,
    sum(oi.quantity
      * (p.cost_price_cents + p.labor_cost_cents + p.packaging_cost_cents + p.overhead_cost_cents)
    )::bigint as cogs_cents
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  join public.products p on p.id = oi.product_id
  where o.status = 'delivered' and o.payment_status = 'paid' and o.is_active
  group by o.buying_date
)
select
  od.day,
  od.orders_count,
  od.revenue_cents,
  od.discount_cents,
  coalesce(cd.cogs_cents, 0) as cogs_cents,
  od.print_material_cost_cents,
  coalesce(cd.cogs_cents, 0) + od.print_material_cost_cents as total_cost_cents,
  od.revenue_cents - coalesce(cd.cogs_cents, 0) - od.print_material_cost_cents as gross_profit_cents,
  od.print_minutes,
  od.filament_grams
from order_days od
left join cogs_days cd on cd.day = od.day;

create unique index uq_mv_revenue_daily on public.mv_revenue_daily (day);

-- ── Per-printer-type cost/usage breakdown ────────────────────────────────────
create materialized view public.mv_printer_stats as
select
  o.printer_type,
  count(*)::bigint as orders_count,
  sum(o.total_cents)::bigint as revenue_cents,
  sum(o.material_cost_cents)::bigint as material_cost_cents,
  sum(o.actual_print_minutes)::bigint as print_minutes,
  sum(o.filament_used_grams)::numeric as filament_grams
from public.orders o
where o.status = 'delivered' and o.payment_status = 'paid' and o.is_active
  and o.printer_type is not null
group by o.printer_type;

create unique index uq_mv_printer_stats on public.mv_printer_stats (printer_type);

-- ── Per-material cost/usage breakdown ────────────────────────────────────────
create materialized view public.mv_material_stats as
select
  o.material_type,
  count(*)::bigint as orders_count,
  sum(o.total_cents)::bigint as revenue_cents,
  sum(o.material_cost_cents)::bigint as material_cost_cents,
  sum(o.filament_used_grams)::numeric as filament_grams
from public.orders o
where o.status = 'delivered' and o.payment_status = 'paid' and o.is_active
  and o.material_type is not null
group by o.material_type;

create unique index uq_mv_material_stats on public.mv_material_stats (material_type);

-- ── Inventory valuation (Analytics “inventory value” KPI) ────────────────────
create materialized view public.mv_inventory_value as
select
  count(*) filter (where p.current_stock > 0)::bigint as products_in_stock,
  count(*) filter (where p.low_stock)::bigint as low_stock_products,
  coalesce(sum(greatest(p.current_stock, 0)::bigint * p.cost_price_cents), 0)::bigint as value_cost_cents,
  coalesce(sum(greatest(p.current_stock, 0)::bigint * p.selling_price_cents), 0)::bigint as value_retail_cents
from public.products p
where p.deleted_at is null and p.is_active;

create unique index uq_mv_inventory_value on public.mv_inventory_value ((1));

-- ── Refresh runner ───────────────────────────────────────────────────────────
create or replace function public.refresh_analytics_views()
returns void language plpgsql security definer set search_path = public as $$
begin
  refresh materialized view concurrently public.mv_product_profitability;
  refresh materialized view concurrently public.mv_revenue_daily;
  refresh materialized view concurrently public.mv_printer_stats;
  refresh materialized view concurrently public.mv_material_stats;
  refresh materialized view concurrently public.mv_inventory_value;
end;
$$;
revoke execute on function public.refresh_analytics_views() from public, anon, authenticated;
grant execute on function public.refresh_analytics_views() to service_role;

-- Every 5 minutes (cached numbers serve instantly; freshness ≤ 5 min).
select cron.schedule(
  'refresh-analytics-views',
  '*/5 * * * *',
  $$select public.refresh_analytics_views()$$
) where not exists (select 1 from cron.job where jobname = 'refresh-analytics-views');

-- MVs are intentionally NOT granted to authenticated/anon: the profit API
-- enforces profit.view server-side and reads them via the service role.
