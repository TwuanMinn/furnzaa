-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Auth wiring + Row Level Security (the "second layer" of access control).  ║
-- ║                                                                            ║
-- ║  • handle_new_user(): auto-creates a public.users profile + preferences    ║
-- ║    whenever Supabase Auth creates an auth.users row (signup/invite).        ║
-- ║  • custom_access_token_hook(): injects `user_role` into the JWT so RLS      ║
-- ║    checks role in O(1) (no per-row DB lookup) — essential at scale.         ║
-- ║  • is_admin()/current_role_key(): read that JWT claim.                      ║
-- ║  • Explicit GRANTs to `authenticated` (Supabase stopped auto-exposing new   ║
-- ║    tables on 2026-05-30), then RLS policies narrow access per role.         ║
-- ║  Note: the `service_role` key bypasses RLS (BYPASSRLS) — server-side        ║
-- ║  privileged operations rely on our server guards instead.                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── JWT role claim helpers (read-only, O(1)) ────────────────────────────────
create or replace function public.current_role_key()
returns text language sql stable as $$
  select coalesce(auth.jwt() ->> 'user_role', '');
$$;

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'user_role', '') = 'admin';
$$;

-- Granular permission check (security definer — bypasses RLS to read the matrix).
-- Used by server guards and occasionally in policies (never on hot per-row paths).
create or replace function public.has_permission(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.users u
    join public.role_permissions rp on rp.role_id = u.role_id
    join public.permissions p on p.id = rp.permission_id
    where u.id = auth.uid() and p.key = p_key
  );
$$;

-- Membership check (security definer to avoid RLS self-recursion on group_members).
create or replace function public.is_group_member(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group and gm.user_id = auth.uid()
  );
$$;

-- ── New auth user → profile + preferences ───────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role_id  uuid;
  v_role_key text;
begin
  v_role_key := coalesce(
    new.raw_app_meta_data ->> 'role',
    new.raw_user_meta_data ->> 'role',
    'staff'
  );
  select id into v_role_id from public.roles where key = v_role_key;
  if v_role_id is null then
    select id into v_role_id from public.roles where key = 'staff';
  end if;

  insert into public.users (id, email, full_name, role_id, phone, department)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    v_role_id,
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'department'
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id) values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Custom access token hook (adds user_role claim) ─────────────────────────
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
declare
  claims     jsonb;
  v_role_key text;
begin
  select r.key into v_role_key
  from public.users u
  join public.roles r on r.id = u.role_id
  where u.id = (event ->> 'user_id')::uuid;

  claims := coalesce(event -> 'claims', '{}'::jsonb);
  claims := jsonb_set(claims, '{user_role}', to_jsonb(coalesce(v_role_key, 'staff')));
  event  := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- The hook runs as the auth admin role; give it the access it needs.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on public.users, public.roles to supabase_auth_admin;

-- ── Protect role/status on self-updates (cannot change own role) ────────────
create or replace function public.protect_user_fields()
returns trigger language plpgsql as $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;
  if new.role_id is distinct from old.role_id
     or new.is_active is distinct from old.is_active
     or new.deleted_at is distinct from old.deleted_at then
    raise exception 'You are not allowed to change role or account status';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_user_fields on public.users;
create trigger trg_protect_user_fields before update on public.users
  for each row execute function public.protect_user_fields();

-- ════════════════════════ GRANTS (Data API exposure) ═══════════════════════
grant usage on schema public to anon, authenticated;

grant select on public.roles, public.permissions, public.role_permissions to authenticated;
grant select, update on public.users to authenticated;
grant select, insert, update on public.user_preferences to authenticated;
grant select, insert, update on public.customers to authenticated;
grant select, insert, update on public.orders to authenticated;
grant select, insert, update, delete on public.order_items to authenticated;
grant select, insert on public.order_status_history to authenticated;
grant select, insert on public.notifications to authenticated;
grant select, update on public.notification_reads to authenticated;
grant select, insert, update on public.message_groups to authenticated;
grant select, update on public.group_members to authenticated;
grant select, insert, update on public.messages to authenticated;
grant select, insert on public.message_attachments to authenticated;
grant select, insert on public.activity_logs to authenticated;
grant select, update on public.organization_settings to authenticated;

-- ════════════════════════════ ENABLE RLS ═══════════════════════════════════
alter table public.roles                 enable row level security;
alter table public.permissions           enable row level security;
alter table public.role_permissions      enable row level security;
alter table public.users                 enable row level security;
alter table public.user_preferences      enable row level security;
alter table public.customers             enable row level security;
alter table public.orders                enable row level security;
alter table public.order_items           enable row level security;
alter table public.order_status_history  enable row level security;
alter table public.notifications         enable row level security;
alter table public.notification_reads    enable row level security;
alter table public.message_groups        enable row level security;
alter table public.group_members         enable row level security;
alter table public.messages              enable row level security;
alter table public.message_attachments   enable row level security;
alter table public.activity_logs         enable row level security;
alter table public.organization_settings enable row level security;
alter table public.order_code_counters   enable row level security;

-- ════════════════════════════ POLICIES ═════════════════════════════════════
-- RBAC reference tables: readable by all authenticated; writes via service role.
create policy roles_read on public.roles for select to authenticated using (true);
create policy permissions_read on public.permissions for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);

-- Users: company directory is readable; self/admin may update (trigger guards fields).
create policy users_read on public.users for select to authenticated using (true);
create policy users_update on public.users for update to authenticated
  using (public.is_admin() or id = auth.uid())
  with check (public.is_admin() or id = auth.uid());
-- Let the auth hook (supabase_auth_admin) read profiles + roles.
create policy users_auth_admin_read on public.users for select to supabase_auth_admin using (true);
create policy roles_auth_admin_read on public.roles for select to supabase_auth_admin using (true);

-- User preferences: owner (or admin) only.
create policy prefs_select on public.user_preferences for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy prefs_insert on public.user_preferences for insert to authenticated
  with check (user_id = auth.uid());
create policy prefs_update on public.user_preferences for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Customers: viewable + editable by any authenticated (server guards customers.edit).
create policy customers_select on public.customers for select to authenticated using (true);
create policy customers_insert on public.customers for insert to authenticated with check (true);
create policy customers_update on public.customers for update to authenticated using (true) with check (true);

-- Orders: admin sees all; staff see own/assigned.
create policy orders_select on public.orders for select to authenticated
  using (public.is_admin() or assigned_staff_id = auth.uid() or created_by = auth.uid());
create policy orders_insert on public.orders for insert to authenticated
  with check (public.is_admin() or created_by = auth.uid());
create policy orders_update on public.orders for update to authenticated
  using (public.is_admin() or assigned_staff_id = auth.uid() or created_by = auth.uid())
  with check (public.is_admin() or assigned_staff_id = auth.uid() or created_by = auth.uid());
create policy orders_delete on public.orders for delete to authenticated
  using (public.is_admin());

-- Order items & status history: inherit visibility from the parent order.
create policy order_items_all on public.order_items for all to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
    and (public.is_admin() or o.assigned_staff_id = auth.uid() or o.created_by = auth.uid())))
  with check (exists (select 1 from public.orders o where o.id = order_id
    and (public.is_admin() or o.assigned_staff_id = auth.uid() or o.created_by = auth.uid())));

create policy osh_select on public.order_status_history for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
    and (public.is_admin() or o.assigned_staff_id = auth.uid() or o.created_by = auth.uid())));
create policy osh_insert on public.order_status_history for insert to authenticated
  with check (changed_by = auth.uid() and exists (select 1 from public.orders o where o.id = order_id
    and (public.is_admin() or o.assigned_staff_id = auth.uid() or o.created_by = auth.uid())));

-- Notifications: recipients (via notification_reads) or admin can read; admin can send.
create policy notifications_select on public.notifications for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.notification_reads nr where nr.notification_id = id and nr.user_id = auth.uid()));
create policy notifications_insert on public.notifications for insert to authenticated
  with check (public.is_admin());

create policy notif_reads_select on public.notification_reads for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy notif_reads_update on public.notification_reads for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Message groups: members or admin; admin creates/manages.
create policy groups_select on public.message_groups for select to authenticated
  using (public.is_admin() or public.is_group_member(id));
create policy groups_insert on public.message_groups for insert to authenticated
  with check (public.is_admin());
create policy groups_update on public.message_groups for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy members_select on public.group_members for select to authenticated
  using (public.is_admin() or public.is_group_member(group_id));
create policy members_update on public.group_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Messages: members read; sender posts; sender/admin edit-delete.
create policy messages_select on public.messages for select to authenticated
  using (public.is_admin() or public.is_group_member(group_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and (public.is_admin() or public.is_group_member(group_id)));
create policy messages_update on public.messages for update to authenticated
  using (public.is_admin() or sender_id = auth.uid())
  with check (public.is_admin() or sender_id = auth.uid());

create policy attachments_select on public.message_attachments for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id
    and (public.is_admin() or public.is_group_member(m.group_id))));
create policy attachments_insert on public.message_attachments for insert to authenticated
  with check (exists (select 1 from public.messages m where m.id = message_id and m.sender_id = auth.uid()));

-- Activity logs: admin sees all; user sees own. Append-only; purge (delete) admin-only.
create policy logs_select on public.activity_logs for select to authenticated
  using (public.is_admin() or actor_id = auth.uid());
create policy logs_insert on public.activity_logs for insert to authenticated
  with check (public.is_admin() or actor_id = auth.uid());
create policy logs_delete on public.activity_logs for delete to authenticated
  using (public.is_admin());

-- Organization settings: everyone reads; admin edits.
create policy org_select on public.organization_settings for select to authenticated using (true);
create policy org_update on public.organization_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- order_code_counters: no authenticated policies (touched only by SECURITY DEFINER fn).
