-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Permission matrix v3 — adds products / inventory / profit / CRM /         ║
-- ║  marketing permissions. MUST stay in sync with src/lib/rbac/permissions.ts ║
-- ║  (the TS file is the app-facing source of truth).                          ║
-- ║  Also seeds the default warehouse.                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

insert into public.permissions (key, description, module) values
  -- Products
  ('products.view',   'View products and categories',        'products'),
  ('products.create', 'Create products/categories/variants', 'products'),
  ('products.edit',   'Edit products/categories/variants',   'products'),
  ('products.delete', 'Delete (soft) products',              'products'),
  ('products.import', 'Import products from CSV',            'products'),
  ('products.export', 'Export products (CSV/PDF)',           'products'),
  -- Inventory
  ('inventory.view',         'View stock levels & movement history', 'inventory'),
  ('inventory.adjust',       'Record inventory movements/adjustments', 'inventory'),
  ('suppliers.view',         'View suppliers',                'inventory'),
  ('suppliers.manage',       'Create/edit suppliers',         'inventory'),
  ('purchase_orders.view',   'View purchase orders',          'inventory'),
  ('purchase_orders.create', 'Create purchase orders',        'inventory'),
  ('purchase_orders.receive','Receive purchase orders (stock in)', 'inventory'),
  ('production.view',        'View production orders & BOM',  'inventory'),
  ('production.manage',      'Create/complete production orders, edit BOM', 'inventory'),
  -- Profit & Cost
  ('profit.view',   'View profit & cost analysis',   'profit'),
  ('profit.export', 'Export profit & cost analysis', 'profit'),
  -- CRM & Loyalty
  ('crm.view',         'View customer segments, tiers & rank history', 'crm'),
  ('crm.manage_tiers', 'Configure tiers, benefits & manual overrides', 'crm'),
  ('vouchers.view',    'View vouchers & redemptions',  'crm'),
  ('vouchers.create',  'Create/issue vouchers',        'crm'),
  -- Marketing
  ('campaigns.view',    'View campaigns & marketing analytics', 'marketing'),
  ('campaigns.create',  'Create/edit campaigns',               'marketing'),
  ('campaigns.send',    'Schedule/send campaigns',             'marketing'),
  ('automation.view',   'View automation rules & runs',        'marketing'),
  ('automation.manage', 'Create/edit automation rules',        'marketing')
on conflict (key) do update set description = excluded.description, module = excluded.module;

-- Admin → everything (idempotent catch-up for all new keys).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'admin'
on conflict do nothing;

-- Staff → operational subset (mirror of STAFF_PERMS in permissions.ts):
-- view products, record movements, create/receive POs, view production,
-- view (not configure) CRM & marketing data.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'products.view',
  'inventory.view', 'inventory.adjust',
  'suppliers.view',
  'purchase_orders.view', 'purchase_orders.create', 'purchase_orders.receive',
  'production.view',
  'crm.view', 'vouchers.view',
  'campaigns.view', 'automation.view'
)
where r.key = 'staff'
on conflict do nothing;

-- ── Default warehouse ─────────────────────────────────────────────────────────
insert into public.warehouses (name, code, address, is_default)
values ('Main Warehouse', 'WH-MAIN', null, true)
on conflict (code) do nothing;

update public.organization_settings
  set default_warehouse_id = (select id from public.warehouses where code = 'WH-MAIN')
  where id = 'org' and default_warehouse_id is null;
