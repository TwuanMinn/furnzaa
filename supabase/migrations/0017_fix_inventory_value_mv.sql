-- Fix: REFRESH MATERIALIZED VIEW CONCURRENTLY requires a unique index on
-- plain COLUMNS — the expression index ((1)) from 0013 doesn't qualify, which
-- made every refresh_analytics_views() cron run fail. Rebuild the singleton
-- view with a real constant column to index, then refresh everything once.

drop materialized view public.mv_inventory_value;

create materialized view public.mv_inventory_value as
select
  1 as singleton_id,
  count(*) filter (where p.current_stock > 0)::bigint as products_in_stock,
  count(*) filter (where p.low_stock)::bigint as low_stock_products,
  coalesce(sum(greatest(p.current_stock, 0)::bigint * p.cost_price_cents), 0)::bigint as value_cost_cents,
  coalesce(sum(greatest(p.current_stock, 0)::bigint * p.selling_price_cents), 0)::bigint as value_retail_cents
from public.products p
where p.deleted_at is null and p.is_active;

create unique index uq_mv_inventory_value on public.mv_inventory_value (singleton_id);

select public.refresh_analytics_views();
