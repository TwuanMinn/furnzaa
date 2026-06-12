-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Reference data seed (idempotent). Lives in a migration so the matrix is    ║
-- ║  ALWAYS present after `supabase db reset` (the auth trigger needs the        ║
-- ║  'staff' role to exist). MUST stay in sync with src/lib/rbac/permissions.ts ║
-- ║  — the TS file is the app-facing source of truth; the seed script re-applies ║
-- ║  it on each run as a guard.                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Roles ----------------------------------------------------------------------
insert into public.roles (key, name, description, is_system, rank) values
  ('admin', 'Admin',
   'Full access: user management, full order CRUD, message groups, all logs, analytics, notifications and settings.',
   true, 100),
  ('staff', 'Staff',
   'Create/update/view their own orders and statuses, participate in assigned message groups, receive notifications, and view their own activity and analytics.',
   true, 40)
on conflict (key) do update
  set name = excluded.name, description = excluded.description, is_system = true, rank = excluded.rank;

-- Permissions ----------------------------------------------------------------
insert into public.permissions (key, description, module) values
  ('dashboard.view', 'View the dashboard', 'dashboard'),
  ('users.view', 'View users list and details', 'users'),
  ('users.create', 'Create users / send invites', 'users'),
  ('users.edit', 'Edit user details', 'users'),
  ('users.deactivate', 'Deactivate (soft-delete) users', 'users'),
  ('users.delete', 'Permanently delete users', 'users'),
  ('users.import', 'Import users from CSV', 'users'),
  ('users.export', 'Export users (CSV/PDF)', 'users'),
  ('orders.view', 'View orders (own/assigned)', 'orders'),
  ('orders.view_all', 'View all orders company-wide', 'orders'),
  ('orders.create', 'Create orders', 'orders'),
  ('orders.edit', 'Edit orders', 'orders'),
  ('orders.delete', 'Delete (soft) orders', 'orders'),
  ('orders.update_status', 'Change order status', 'orders'),
  ('orders.assign', 'Assign orders to staff', 'orders'),
  ('orders.import', 'Import orders from CSV', 'orders'),
  ('orders.export', 'Export orders (CSV/PDF)', 'orders'),
  ('customers.view', 'View customers & order history', 'customers'),
  ('customers.edit', 'Create/edit customer records', 'customers'),
  ('notifications.view', 'View notifications', 'notifications'),
  ('notifications.create', 'Compose & send notifications', 'notifications'),
  ('messages.view', 'View messages & conversations', 'messages'),
  ('messages.send', 'Send messages', 'messages'),
  ('messages.create_group', 'Create message groups', 'messages'),
  ('messages.manage_group', 'Manage group members/settings', 'messages'),
  ('messages.delete_any', 'Delete any user''s messages', 'messages'),
  ('logs.view', 'View own activity log entries', 'logs'),
  ('logs.view_all', 'View all activity logs', 'logs'),
  ('logs.export', 'Export activity logs', 'logs'),
  ('logs.purge', 'Purge old activity logs', 'logs'),
  ('analytics.view', 'View own analytics', 'analytics'),
  ('analytics.view_team', 'View company-wide analytics', 'analytics'),
  ('analytics.export', 'Export analytics', 'analytics'),
  ('settings.view', 'View organization settings', 'settings'),
  ('settings.edit_company', 'Edit company/branding settings', 'settings'),
  ('settings.edit_roles', 'Edit roles & permission matrix', 'settings'),
  ('settings.edit_order_config', 'Edit order configuration', 'settings'),
  ('settings.edit_data', 'Manage data import/export/retention', 'settings'),
  ('settings.edit_security', 'Edit security settings', 'settings')
on conflict (key) do update set description = excluded.description, module = excluded.module;

-- Admin → ALL permissions
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'admin'
on conflict do nothing;

-- Staff → scoped subset (mirror of STAFF_PERMS in permissions.ts)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view',
  'orders.view', 'orders.create', 'orders.edit', 'orders.update_status', 'orders.export',
  'customers.view', 'customers.edit',
  'notifications.view',
  'messages.view', 'messages.send',
  'logs.view',
  'analytics.view'
)
where r.key = 'staff'
on conflict do nothing;

-- Default organization settings (singleton) --------------------------------
insert into public.organization_settings (
  id, company_name, currency, default_tax_rate,
  order_statuses, order_priorities, order_code_prefix, order_code_format,
  password_policy
) values (
  'org', 'Furnza', 'USD', 0,
  '[
    {"key":"pending","label":"Pending","color":"slate","isFinal":false},
    {"key":"processing","label":"Processing","color":"blue","isFinal":false},
    {"key":"shipped","label":"Shipped","color":"indigo","isFinal":false},
    {"key":"delivered","label":"Delivered","color":"green","isFinal":true},
    {"key":"returned","label":"Returned","color":"amber","isFinal":true},
    {"key":"cancelled","label":"Cancelled","color":"red","isFinal":true}
  ]'::jsonb,
  '[
    {"key":"low","label":"Low","color":"slate"},
    {"key":"medium","label":"Medium","color":"blue"},
    {"key":"high","label":"High","color":"amber"},
    {"key":"extreme","label":"Extreme","color":"red"}
  ]'::jsonb,
  'FZ', '{prefix}-{yyyy}-{seq}',
  '{"minLength":8,"requireUpper":true,"requireNumber":true,"requireSymbol":false}'::jsonb
)
on conflict (id) do nothing;
