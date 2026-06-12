-- Granular settings keys for the two v6 config sections (the spec's settings
-- matrix is per-section). Admin holds everything via the catch-up insert;
-- staff get neither (settings are Admin-only throughout).

insert into public.permissions (key, description, module) values
  ('settings.edit_trending', 'Edit trending configuration', 'settings'),
  ('settings.edit_feedback', 'Edit feedback configuration', 'settings')
on conflict (key) do update set description = excluded.description, module = excluded.module;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'admin'
on conflict do nothing;
