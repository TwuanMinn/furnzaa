-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Products & Inventory (spec v3, Module 3).                                 ║
-- ║   • products / categories / variants (sku+barcode indexed, trgm name)      ║
-- ║   • warehouses + warehouse_inventory (multi-warehouse stock)               ║
-- ║   • inventory_movements — append-only ledger; ALL stock changes go through ║
-- ║     apply_inventory_movement() which locks the product row, writes the     ║
-- ║     movement with correct previous/new stock, and updates current_stock    ║
-- ║     + warehouse_inventory atomically. Direct stock edits are forbidden.    ║
-- ║   • suppliers, purchase_orders (+items, receive→stock RPC),                ║
-- ║     production_orders + bill_of_materials (complete→consume/produce RPC).  ║
-- ║  Conventions: money = bigint cents; soft delete = is_active/deleted_at;    ║
-- ║  statuses fixed by spec use CHECK constraints; RLS on everything.          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Categories ───────────────────────────────────────────────────────────────
create table public.product_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  is_active   boolean not null default true,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index uq_product_categories_name on public.product_categories (lower(name)) where deleted_at is null;
create trigger trg_product_categories_updated before update on public.product_categories
  for each row execute function public.set_updated_at();

-- ── Products ─────────────────────────────────────────────────────────────────
create table public.products (
  id                   uuid primary key default gen_random_uuid(),
  sku                  text not null unique,          -- auto-generated, prefix from Settings
  barcode              text,
  name                 text not null,
  category_id          uuid references public.product_categories (id) on delete set null,
  description          text,
  image_url            text,                          -- Supabase Storage (product-images bucket)
  cost_price_cents     bigint not null default 0,     -- purchase/material cost per unit
  labor_cost_cents     bigint not null default 0,     -- per-unit cost components used by
  packaging_cost_cents bigint not null default 0,     -- Profit & Cost Analysis
  overhead_cost_cents  bigint not null default 0,
  selling_price_cents  bigint not null default 0,
  current_stock        integer not null default 0,    -- maintained ONLY via movements
  minimum_stock        integer not null default 0,
  status               text not null default 'active' check (status in ('active','inactive','discontinued')),
  is_active            boolean not null default true,
  deleted_at           timestamptz,
  created_by           uuid references public.users (id) on delete set null,
  updated_by           uuid references public.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index idx_products_barcode on public.products (barcode);
create index idx_products_category on public.products (category_id);
create index idx_products_status on public.products (status);
create index idx_products_name_trgm on public.products using gin (name extensions.gin_trgm_ops);
create index idx_products_sku_trgm on public.products using gin (sku extensions.gin_trgm_ops);
create index idx_products_created_keyset on public.products (created_at desc, id desc);
-- Low-stock listings without scanning healthy rows:
create index idx_products_low_stock on public.products (current_stock)
  where deleted_at is null;
create trigger trg_products_updated before update on public.products
  for each row execute function public.set_updated_at();

-- ── Variants ─────────────────────────────────────────────────────────────────
create table public.product_variants (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references public.products (id) on delete cascade,
  sku                 text not null unique,
  barcode             text,
  attributes          jsonb not null default '{}'::jsonb,  -- e.g. {"color":"Black","size":"XL"}
  cost_price_cents    bigint,                              -- null = inherit product
  selling_price_cents bigint,
  current_stock       integer not null default 0,
  minimum_stock       integer not null default 0,
  is_active           boolean not null default true,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index idx_variants_product on public.product_variants (product_id);
create index idx_variants_barcode on public.product_variants (barcode);
create trigger trg_product_variants_updated before update on public.product_variants
  for each row execute function public.set_updated_at();

-- ── Warehouses ───────────────────────────────────────────────────────────────
create table public.warehouses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       text not null unique,
  address    text,
  is_default boolean not null default false,
  is_active  boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_warehouses_updated before update on public.warehouses
  for each row execute function public.set_updated_at();

create table public.warehouse_inventory (
  id           uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  product_id   uuid not null references public.products (id) on delete cascade,
  variant_id   uuid references public.product_variants (id) on delete cascade,
  quantity     integer not null default 0,
  updated_at   timestamptz not null default now(),
  unique nulls not distinct (warehouse_id, product_id, variant_id)
);
create index idx_warehouse_inventory_product on public.warehouse_inventory (product_id);
create trigger trg_warehouse_inventory_updated before update on public.warehouse_inventory
  for each row execute function public.set_updated_at();

-- ── Inventory movements (append-only ledger) ────────────────────────────────
create table public.inventory_movements (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products (id) on delete cascade,
  variant_id     uuid references public.product_variants (id) on delete set null,
  warehouse_id   uuid references public.warehouses (id) on delete set null,
  movement_type  text not null check (movement_type in ('purchase','sale','production','adjustment','transfer','return')),
  quantity       integer not null,            -- signed delta (+in / −out); never 0
  previous_stock integer not null,
  new_stock      integer not null,
  notes          text,
  reference_type text,                        -- 'order' | 'purchase_order' | 'production_order' | ...
  reference_id   uuid,
  created_by     uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  check (quantity <> 0)
);
create index idx_inv_mov_product on public.inventory_movements (product_id);
create index idx_inv_mov_type on public.inventory_movements (movement_type);
create index idx_inv_mov_created on public.inventory_movements (created_at desc, id desc);
create index idx_inv_mov_product_created on public.inventory_movements (product_id, created_at desc);
create index idx_inv_mov_reference on public.inventory_movements (reference_type, reference_id);

-- ── Suppliers ────────────────────────────────────────────────────────────────
create table public.suppliers (
  id           uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  email        text,
  phone        text,
  address      text,
  notes        text,
  is_active    boolean not null default true,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_suppliers_name_trgm on public.suppliers using gin (company_name extensions.gin_trgm_ops);
create trigger trg_suppliers_updated before update on public.suppliers
  for each row execute function public.set_updated_at();

-- ── Purchase orders ──────────────────────────────────────────────────────────
create table public.purchase_orders (
  id               uuid primary key default gen_random_uuid(),
  po_number        text not null unique,
  supplier_id      uuid not null references public.suppliers (id),
  order_date       date not null default current_date,
  expected_date    date,
  status           text not null default 'draft' check (status in ('draft','ordered','received','cancelled')),
  total_cost_cents bigint not null default 0,
  notes            text,
  received_by      uuid references public.users (id) on delete set null,
  received_at      timestamptz,
  created_by       uuid references public.users (id) on delete set null,
  is_active        boolean not null default true,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_po_supplier on public.purchase_orders (supplier_id);
create index idx_po_status on public.purchase_orders (status);
create index idx_po_order_date on public.purchase_orders (order_date desc);
create index idx_po_created_keyset on public.purchase_orders (created_at desc, id desc);
create trigger trg_purchase_orders_updated before update on public.purchase_orders
  for each row execute function public.set_updated_at();

create table public.purchase_order_items (
  id               uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  product_id       uuid not null references public.products (id),
  variant_id       uuid references public.product_variants (id) on delete set null,
  quantity         integer not null check (quantity > 0),
  unit_cost_cents  bigint not null default 0,
  line_total_cents bigint not null default 0,
  sort_order       integer not null default 0
);
create index idx_po_items_po on public.purchase_order_items (purchase_order_id);
create index idx_po_items_product on public.purchase_order_items (product_id);

-- ── Production: BOM + production orders ─────────────────────────────────────
create table public.bill_of_materials (
  id                   uuid primary key default gen_random_uuid(),
  finished_product_id  uuid not null references public.products (id) on delete cascade,
  component_product_id uuid not null references public.products (id) on delete cascade,
  quantity_per_unit    numeric(12,3) not null check (quantity_per_unit > 0),
  created_at           timestamptz not null default now(),
  unique (finished_product_id, component_product_id),
  check (finished_product_id <> component_product_id)
);
create index idx_bom_component on public.bill_of_materials (component_product_id);

create table public.production_orders (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,
  product_id           uuid not null references public.products (id),
  quantity             integer not null check (quantity > 0),
  status               text not null default 'pending' check (status in ('pending','in_progress','completed','cancelled')),
  material_cost_cents  bigint not null default 0,   -- computed from BOM on completion
  labor_cost_cents     bigint not null default 0,   -- entered
  packaging_cost_cents bigint not null default 0,
  overhead_cost_cents  bigint not null default 0,
  total_cost_cents     bigint not null default 0,
  notes                text,
  started_at           timestamptz,
  completed_at         timestamptz,
  completed_by         uuid references public.users (id) on delete set null,
  created_by           uuid references public.users (id) on delete set null,
  is_active            boolean not null default true,
  deleted_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index idx_production_product on public.production_orders (product_id);
create index idx_production_status on public.production_orders (status);
create index idx_production_created_keyset on public.production_orders (created_at desc, id desc);
create trigger trg_production_orders_updated before update on public.production_orders
  for each row execute function public.set_updated_at();

-- ════════════════════════ ATOMIC STOCK RPCs ═════════════════════════════════

-- THE single write-path for stock. Locks the product row, writes the ledger row
-- with consistent previous/new stock, updates products.current_stock (and the
-- variant + warehouse rows when given). Returns the movement id.
-- SECURITY DEFINER: table policies forbid direct writes; server actions enforce
-- the inventory.* permissions before calling.
create or replace function public.apply_inventory_movement(
  p_product_id     uuid,
  p_movement_type  text,
  p_quantity       integer,                -- signed delta
  p_variant_id     uuid default null,
  p_warehouse_id   uuid default null,
  p_notes          text default null,
  p_reference_type text default null,
  p_reference_id   uuid default null,
  p_allow_negative boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_prev integer;
  v_new  integer;
  v_id   uuid;
  v_wh   uuid;
begin
  if p_quantity = 0 then
    raise exception 'Movement quantity cannot be zero';
  end if;
  if p_movement_type not in ('purchase','sale','production','adjustment','transfer','return') then
    raise exception 'Invalid movement type %', p_movement_type;
  end if;

  -- Serialize concurrent stock changes per product.
  select current_stock into v_prev from public.products where id = p_product_id for update;
  if v_prev is null then
    raise exception 'Product % not found', p_product_id;
  end if;

  v_new := v_prev + p_quantity;
  if v_new < 0 and not p_allow_negative then
    raise exception 'Insufficient stock: have %, change %', v_prev, p_quantity;
  end if;

  -- Default warehouse when none specified.
  v_wh := p_warehouse_id;
  if v_wh is null then
    select id into v_wh from public.warehouses where is_default and deleted_at is null limit 1;
  end if;

  insert into public.inventory_movements
    (product_id, variant_id, warehouse_id, movement_type, quantity,
     previous_stock, new_stock, notes, reference_type, reference_id, created_by)
  values
    (p_product_id, p_variant_id, v_wh, p_movement_type, p_quantity,
     v_prev, v_new, p_notes, p_reference_type, p_reference_id, auth.uid())
  returning id into v_id;

  update public.products set current_stock = v_new, updated_by = auth.uid() where id = p_product_id;

  if p_variant_id is not null then
    update public.product_variants
      set current_stock = current_stock + p_quantity
      where id = p_variant_id;
  end if;

  if v_wh is not null then
    insert into public.warehouse_inventory (warehouse_id, product_id, variant_id, quantity)
    values (v_wh, p_product_id, p_variant_id, p_quantity)
    on conflict (warehouse_id, product_id, variant_id)
    do update set quantity = public.warehouse_inventory.quantity + excluded.quantity;
  end if;

  return v_id;
end;
$$;
grant execute on function public.apply_inventory_movement(uuid, text, integer, uuid, uuid, text, text, uuid, boolean)
  to authenticated, service_role;

-- Receive a purchase order: one transaction → 'purchase' movement per line,
-- status flip, received stamps. Idempotent: a PO can be received exactly once.
create or replace function public.receive_purchase_order(p_po_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_count  integer := 0;
  r record;
begin
  select status into v_status from public.purchase_orders where id = p_po_id for update;
  if v_status is null then
    raise exception 'Purchase order % not found', p_po_id;
  end if;
  if v_status = 'received' then
    raise exception 'Purchase order already received';
  end if;
  if v_status = 'cancelled' then
    raise exception 'Cannot receive a cancelled purchase order';
  end if;

  for r in
    select product_id, variant_id, quantity from public.purchase_order_items
    where purchase_order_id = p_po_id
  loop
    perform public.apply_inventory_movement(
      r.product_id, 'purchase', r.quantity, r.variant_id, null,
      'PO received', 'purchase_order', p_po_id);
    v_count := v_count + 1;
  end loop;

  update public.purchase_orders
    set status = 'received', received_by = auth.uid(), received_at = now()
    where id = p_po_id;

  return v_count;
end;
$$;
grant execute on function public.receive_purchase_order(uuid) to authenticated, service_role;

-- Complete a production order: consume BOM components (negative 'production'
-- movements), produce finished goods (positive), record material cost from
-- component cost prices, total the cost. Idempotent via status guard.
create or replace function public.complete_production_order(p_id uuid)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_po record;
  v_material_cents bigint := 0;
  v_total bigint;
  r record;
begin
  select * into v_po from public.production_orders where id = p_id for update;
  if v_po.id is null then
    raise exception 'Production order % not found', p_id;
  end if;
  if v_po.status = 'completed' then
    raise exception 'Production order already completed';
  end if;
  if v_po.status = 'cancelled' then
    raise exception 'Cannot complete a cancelled production order';
  end if;

  -- Consume components per BOM.
  for r in
    select b.component_product_id,
           ceil(b.quantity_per_unit * v_po.quantity)::integer as needed,
           p.cost_price_cents
    from public.bill_of_materials b
    join public.products p on p.id = b.component_product_id
    where b.finished_product_id = v_po.product_id
  loop
    perform public.apply_inventory_movement(
      r.component_product_id, 'production', -r.needed, null, null,
      'Consumed by production ' || v_po.code, 'production_order', p_id);
    v_material_cents := v_material_cents + (r.cost_price_cents * r.needed);
  end loop;

  -- Produce finished goods.
  perform public.apply_inventory_movement(
    v_po.product_id, 'production', v_po.quantity, null, null,
    'Produced by ' || v_po.code, 'production_order', p_id);

  v_total := v_material_cents + v_po.labor_cost_cents + v_po.packaging_cost_cents + v_po.overhead_cost_cents;

  update public.production_orders
    set status = 'completed',
        material_cost_cents = v_material_cents,
        total_cost_cents = v_total,
        completed_at = now(),
        completed_by = auth.uid()
    where id = p_id;

  return v_total;
end;
$$;
grant execute on function public.complete_production_order(uuid) to authenticated, service_role;

-- Sequential document numbers (PO-2026-000123, PRD-2026-000007) reusing the
-- counters table from next_order_code.
create or replace function public.next_document_number(p_prefix text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_key  text := p_prefix || '-' || v_year;
  v_seq  bigint;
begin
  insert into public.order_code_counters (prefix_year, value)
  values (v_key, 1)
  on conflict (prefix_year) do update set value = order_code_counters.value + 1
  returning value into v_seq;
  return v_key || '-' || lpad(v_seq::text, 6, '0');
end;
$$;
grant execute on function public.next_document_number(text) to authenticated, service_role;

-- ════════════════════════ GRANTS + RLS ══════════════════════════════════════
grant select, insert, update on public.product_categories, public.products,
  public.product_variants, public.warehouses, public.suppliers,
  public.purchase_orders, public.purchase_order_items,
  public.production_orders, public.bill_of_materials to authenticated;
grant select on public.inventory_movements, public.warehouse_inventory to authenticated;

alter table public.product_categories  enable row level security;
alter table public.products            enable row level security;
alter table public.product_variants    enable row level security;
alter table public.warehouses          enable row level security;
alter table public.warehouse_inventory enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.suppliers           enable row level security;
alter table public.purchase_orders     enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.production_orders   enable row level security;
alter table public.bill_of_materials   enable row level security;

-- Catalog: all authenticated read; admin writes (server actions enforce products.*).
create policy categories_select on public.product_categories for select to authenticated using (true);
create policy categories_write on public.product_categories for insert to authenticated with check (public.is_admin());
create policy categories_update on public.product_categories for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy products_select on public.products for select to authenticated using (true);
create policy products_insert on public.products for insert to authenticated with check (public.is_admin());
create policy products_update on public.products for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy variants_select on public.product_variants for select to authenticated using (true);
create policy variants_insert on public.product_variants for insert to authenticated with check (public.is_admin());
create policy variants_update on public.product_variants for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy warehouses_select on public.warehouses for select to authenticated using (true);
create policy warehouses_insert on public.warehouses for insert to authenticated with check (public.is_admin());
create policy warehouses_update on public.warehouses for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Stock tables: read-only via the Data API; ALL writes go through the
-- SECURITY DEFINER RPCs above (no insert/update policies on purpose).
create policy wh_inventory_select on public.warehouse_inventory for select to authenticated using (true);
create policy inv_movements_select on public.inventory_movements for select to authenticated using (true);

-- Suppliers: read all; staff may create (purchasing flow), admin edits.
create policy suppliers_select on public.suppliers for select to authenticated using (true);
create policy suppliers_insert on public.suppliers for insert to authenticated with check (true);
create policy suppliers_update on public.suppliers for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Purchase orders: staff create + edit their own drafts; admin everything.
create policy po_select on public.purchase_orders for select to authenticated using (true);
create policy po_insert on public.purchase_orders for insert to authenticated
  with check (created_by = auth.uid() or public.is_admin());
create policy po_update on public.purchase_orders for update to authenticated
  using (public.is_admin() or (created_by = auth.uid() and status in ('draft','ordered')))
  with check (public.is_admin() or created_by = auth.uid());

create policy po_items_select on public.purchase_order_items for select to authenticated using (true);
create policy po_items_write on public.purchase_order_items for all to authenticated
  using (exists (select 1 from public.purchase_orders po where po.id = purchase_order_id
    and (public.is_admin() or (po.created_by = auth.uid() and po.status in ('draft','ordered')))))
  with check (exists (select 1 from public.purchase_orders po where po.id = purchase_order_id
    and (public.is_admin() or (po.created_by = auth.uid() and po.status in ('draft','ordered')))));

-- Production: read all; admin manages (production.manage is admin-only).
create policy production_select on public.production_orders for select to authenticated using (true);
create policy production_insert on public.production_orders for insert to authenticated with check (public.is_admin());
create policy production_update on public.production_orders for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy bom_select on public.bill_of_materials for select to authenticated using (true);
create policy bom_write on public.bill_of_materials for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── Realtime: live stock updates ─────────────────────────────────────────────
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.inventory_movements;

comment on table public.inventory_movements is
  'Append-only stock ledger. Stock NEVER changes except through apply_inventory_movement().';
