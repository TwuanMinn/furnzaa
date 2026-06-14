-- ════════════════════════════ STAFF TASKS ════════════════════════════════════
-- Per-staff task list shown on the user-detail "Tasks" tab and rolled into the
-- Performance tab. Mirrors the app conventions: soft-delete, created_by/
-- updated_by, set_updated_at trigger, RLS gated by public.has_permission().

create table public.staff_tasks (
  id            uuid primary key default gen_random_uuid(),
  assigned_to   uuid not null references public.users (id) on delete cascade,
  title         text not null check (length(trim(title)) > 0),
  priority      text not null default 'medium'
                check (priority in ('high', 'medium', 'low')),
  category      text not null default 'Admin'
                check (category in ('Packing', 'Inventory', 'Returns', 'Compliance', 'Logistics', 'Admin')),
  due_date      date,
  done          boolean not null default false,
  completed_at  timestamptz,
  is_active     boolean not null default true,
  deleted_at    timestamptz,
  created_by    uuid references public.users (id) on delete set null,
  updated_by    uuid references public.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- The tab reads one staff member's active tasks; index the access path.
create index idx_staff_tasks_assignee on public.staff_tasks (assigned_to, due_date);
create index idx_staff_tasks_active on public.staff_tasks (assigned_to) where is_active;

create trigger trg_staff_tasks_updated before update on public.staff_tasks
  for each row execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- View: your own tasks, or anyone's with tasks.view_all.
-- Insert: tasks.manage (assigning to staff is a managerial action).
-- Update: your own (so a staff member can tick their own task done) or
--         tasks.manage (an admin completing/editing anyone's).
-- NOTE: today the only UI surface is the user-detail Tasks tab, reached via the
-- admin-only Users page — so in practice an admin (tasks.view_all + manage)
-- drives this. The `assigned_to = auth.uid()` own-row branches and the staff
-- `tasks.view` grant are deliberately retained so a future staff self-service
-- ("My tasks") view is already safe by construction; they are not dead.
grant select, insert, update on public.staff_tasks to authenticated;
alter table public.staff_tasks enable row level security;

create policy staff_tasks_select on public.staff_tasks for select to authenticated
  using (assigned_to = auth.uid() or public.has_permission('tasks.view_all'));
create policy staff_tasks_insert on public.staff_tasks for insert to authenticated
  with check (public.has_permission('tasks.manage'));
create policy staff_tasks_update on public.staff_tasks for update to authenticated
  using (assigned_to = auth.uid() or public.has_permission('tasks.manage'))
  with check (assigned_to = auth.uid() or public.has_permission('tasks.manage'));

-- ── Permission matrix (mirror of src/lib/rbac/permissions.ts) ──────────────────
insert into public.permissions (key, description, module) values
  ('tasks.view', 'View staff tasks (own; complete own)', 'tasks'),
  ('tasks.view_all', 'View every staff member''s tasks', 'tasks'),
  ('tasks.manage', 'Assign, edit and delete staff tasks', 'tasks')
on conflict (key) do update set description = excluded.description, module = excluded.module;

-- Admin gets everything (catch-up); staff get tasks.view (see + complete own).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.key = 'staff' and p.key = 'tasks.view'
on conflict do nothing;

-- ── Demo backfill ──────────────────────────────────────────────────────────────
-- Seed a starter task list for existing staff so the tab isn't empty on first
-- view. No-op on a fresh `db reset` (this runs before the seed creates users),
-- and idempotent (skips any staff member who already has tasks).
insert into public.staff_tasks (assigned_to, title, priority, category, due_date, done, completed_at, created_by)
select u.id, t.title, t.priority, t.category, current_date + t.due_offset,
       t.done, case when t.done then now() else null end, u.id
from public.users u
cross join (values
  ('Pack rush order FZ-2026-000031', 'high',   'Packing',    -1, false),
  ('Recount PLA filament spools',     'medium', 'Inventory',   1, false),
  ('Inspect the returned keyboard stand', 'high', 'Returns',   0, false),
  ('Sign off on the QA checklist',    'high',   'Compliance', -3, true),
  ('Confirm the courier pickup window', 'medium', 'Logistics', 1, false),
  ('Update the staff rota',           'low',    'Admin',       3, false),
  ('Review supplier safety data sheets', 'low', 'Compliance',  9, true)
) as t(title, priority, category, due_offset, done)
where u.role_id = (select id from public.roles where key = 'staff')
  and u.is_active
  and not exists (select 1 from public.staff_tasks st where st.assigned_to = u.id);

-- Let PostgREST expose the new table immediately (no container restart needed).
notify pgrst, 'reload schema';
