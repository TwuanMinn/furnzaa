-- Low-stock as a STORED generated column: PostgREST filters can't compare two
-- columns (current_stock <= minimum_stock), and computing it per-request would
-- scan. The generated column updates itself on every stock write and the
-- partial index makes "show low stock" instant at millions of products.
alter table public.products
  add column low_stock boolean generated always as (current_stock <= minimum_stock) stored;

create index idx_products_low_stock_flag on public.products (low_stock)
  where low_stock and deleted_at is null;

-- The original helper index is superseded by the flag.
drop index if exists public.idx_products_low_stock;
