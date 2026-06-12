-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Orders: 3D-printing fields, product-linked line items, voucher link,      ║
-- ║  and the Shipped/Returned → inventory movement wiring (spec v3, Module 2). ║
-- ║   • printer_type / material come from Admin-configurable lists stored in    ║
-- ║     organization_settings (seeded: Bambu Lab lineup + common filaments) —   ║
-- ║     TEXT + index, validated app-side against settings, so new printers      ║
-- ║     need zero schema changes.                                               ║
-- ║   • printing time stored as total MINUTES (sortable/aggregatable).          ║
-- ║   • model files (.stl/.3mf/.step/.obj) ride a jsonb manifest; binaries      ║
-- ║     live in the private 'models' storage bucket.                            ║
-- ║   • apply_order_stock_movements(): idempotent Sale/Return ledger writes.    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

alter table public.orders
  add column printer_type            text,                -- key from settings printer list
  add column estimated_print_minutes integer check (estimated_print_minutes is null or estimated_print_minutes >= 0),
  add column actual_print_minutes    integer check (actual_print_minutes is null or actual_print_minutes >= 0),
  add column material_type           text,                -- key from settings material list
  add column material_color          text,
  add column filament_used_grams     numeric(10,2) check (filament_used_grams is null or filament_used_grams >= 0),
  add column material_cost_cents     bigint not null default 0,  -- grams × per-gram cost (Settings)
  add column nozzle_size_mm          numeric(4,2),
  add column layer_height_mm         numeric(4,2),
  add column infill_percent          integer check (infill_percent is null or (infill_percent between 0 and 100)),
  add column post_processing         text,                -- support removal, sanding, painting, assembly…
  add column model_files             jsonb not null default '[]'::jsonb,
  -- [{name, path, size_bytes, mime}] in the 'models' bucket
  add column voucher_id              uuid references public.vouchers (id) on delete set null,
  add column discount_cents          bigint not null default 0,
  -- Idempotency stamps for the inventory hooks:
  add column sale_movements_at       timestamptz,
  add column return_movements_at     timestamptz;

create index idx_orders_printer_type on public.orders (printer_type);
create index idx_orders_material_type on public.orders (material_type);
create index idx_orders_actual_print_minutes on public.orders (actual_print_minutes);
create index idx_orders_voucher on public.orders (voucher_id);

-- Line items reference catalog products (nullable: legacy/imported free-text lines).
alter table public.order_items
  add column product_id uuid references public.products (id) on delete set null,
  add column variant_id uuid references public.product_variants (id) on delete set null;
create index idx_order_items_product on public.order_items (product_id);

-- ── Shipped → Sale movements / Returned → Return movements ──────────────────
-- One call per transition; IDEMPOTENT via the stamps (re-running is a no-op).
-- Only lines with product_id move stock; free-text lines are skipped.
create or replace function public.apply_order_stock_movements(
  p_order_id  uuid,
  p_direction text            -- 'sale' | 'return'
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  o record;
  r record;
  v_count integer := 0;
begin
  if p_direction not in ('sale','return') then
    raise exception 'Direction must be sale or return';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    raise exception 'Order % not found', p_order_id;
  end if;

  if p_direction = 'sale' then
    if o.sale_movements_at is not null then return 0; end if;   -- already applied
  else
    if o.return_movements_at is not null then return 0; end if;
    if o.sale_movements_at is null then return 0; end if;        -- nothing to restore
  end if;

  for r in
    select product_id, variant_id, quantity from public.order_items
    where order_id = p_order_id and product_id is not null and quantity > 0
  loop
    perform public.apply_inventory_movement(
      r.product_id,
      case p_direction when 'sale' then 'sale' else 'return' end,
      case p_direction when 'sale' then -r.quantity else r.quantity end,
      r.variant_id, null,
      case p_direction when 'sale' then 'Order shipped' else 'Order returned' end,
      'order', p_order_id,
      true);  -- allow negative: shipping must not be blocked by drifted stock
    v_count := v_count + 1;
  end loop;

  if p_direction = 'sale' then
    update public.orders set sale_movements_at = now() where id = p_order_id;
  else
    update public.orders set return_movements_at = now() where id = p_order_id;
  end if;

  return v_count;
end;
$$;
grant execute on function public.apply_order_stock_movements(uuid, text) to authenticated, service_role;

-- ── Settings: printer / material / SKU / inventory config ───────────────────
alter table public.organization_settings
  add column printer_types jsonb not null default '[]'::jsonb,
  -- [{key,label,color,is_active}]
  add column material_types jsonb not null default '[]'::jsonb,
  -- [{key,label,color,cost_per_gram_cents,is_active}]
  add column sku_prefix text not null default 'SKU',
  add column sku_format text not null default '{prefix}-{seq}',
  add column barcode_format text not null default 'EAN13',
  add column default_warehouse_id uuid,
  add column low_stock_alerts_enabled boolean not null default true,
  add column voucher_defaults jsonb not null default '{"type":"fixed","value_cents":1000,"valid_days":30}'::jsonb,
  add column customer_score_rules jsonb not null default '{"points_per_order":1,"points_per_100_currency":1}'::jsonb,
  add column marketing_config jsonb not null default '{"sender_name":"Furnza","sender_email":"no-reply@furnza.local","tracking_enabled":true,"quiet_hours":{"start":"21:00","end":"08:00"}}'::jsonb;

-- Seed the Admin-configurable printer list (current Bambu Lab lineup) and
-- common filament/material list with per-gram default costs (cents).
update public.organization_settings set
  printer_types = '[
    {"key":"a1_mini","label":"A1 Mini","color":"slate","is_active":true},
    {"key":"a1","label":"A1","color":"slate","is_active":true},
    {"key":"a2l","label":"A2L","color":"slate","is_active":true},
    {"key":"p1s","label":"P1S","color":"blue","is_active":true},
    {"key":"p2s","label":"P2S","color":"blue","is_active":true},
    {"key":"x1c","label":"X1C","color":"indigo","is_active":true},
    {"key":"x1e","label":"X1E","color":"indigo","is_active":true},
    {"key":"x2d","label":"X2D","color":"indigo","is_active":true},
    {"key":"h2d","label":"H2D","color":"violet","is_active":true},
    {"key":"h2s","label":"H2S","color":"violet","is_active":true},
    {"key":"h2c","label":"H2C","color":"violet","is_active":true}
  ]'::jsonb,
  material_types = '[
    {"key":"pla","label":"PLA","color":"green","cost_per_gram_cents":2,"is_active":true},
    {"key":"petg","label":"PETG","color":"blue","cost_per_gram_cents":3,"is_active":true},
    {"key":"abs","label":"ABS","color":"amber","cost_per_gram_cents":3,"is_active":true},
    {"key":"asa","label":"ASA","color":"amber","cost_per_gram_cents":4,"is_active":true},
    {"key":"tpu","label":"TPU","color":"violet","cost_per_gram_cents":5,"is_active":true},
    {"key":"pc","label":"PC","color":"slate","cost_per_gram_cents":6,"is_active":true},
    {"key":"pa_nylon","label":"PA / Nylon","color":"indigo","cost_per_gram_cents":7,"is_active":true},
    {"key":"cf_blend","label":"CF Blends","color":"red","cost_per_gram_cents":10,"is_active":true}
  ]'::jsonb
where id = 'org';

-- ── Storage: model files + product images ────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('models', 'models', false, 104857600,  -- 100 MB; .stl/.3mf/.step/.obj arrive as octet-stream/model/*
   array['model/stl','model/3mf','model/step','model/obj','application/octet-stream',
         'application/vnd.ms-pki.stl','application/sla','text/plain']),
  ('product-images', 'product-images', true, 5242880,
   array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- models: private — owner/admin (cross-user access via server-signed URLs).
create policy models_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'models' and owner = auth.uid());
create policy models_select on storage.objects for select to authenticated
  using (bucket_id = 'models' and (owner = auth.uid() or public.is_admin()));
create policy models_delete on storage.objects for delete to authenticated
  using (bucket_id = 'models' and (owner = auth.uid() or public.is_admin()));

-- product-images: public read; admin writes.
create policy product_images_read on storage.objects for select
  using (bucket_id = 'product-images');
create policy product_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());
create policy product_images_update on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());
create policy product_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
