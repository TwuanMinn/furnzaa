-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Users v4 (spec v4, Module 1).                                             ║
-- ║   • status: active | deactivated | banned (ban records reason/by/at).      ║
-- ║     is_active stays as the derived "can log in" flag (kept in sync by      ║
-- ║     trigger) so every existing is_active check keeps working.              ║
-- ║   • birthday + gender profile fields.                                      ║
-- ║   • user_pins — each ADMIN pins users to the top of their OWN list.        ║
-- ║   • user_activity_daily — per-user-per-day rollup (logins + actions)       ║
-- ║     feeding the GitHub-style heatmap. Maintained INCREMENTALLY by an       ║
-- ║     AFTER INSERT trigger on activity_logs (O(1) upsert per event) —        ║
-- ║     never by scanning activity_logs at read time.                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Status / ban model ───────────────────────────────────────────────────────
alter table public.users
  add column status     text not null default 'active'
                        check (status in ('active','deactivated','banned')),
  add column ban_reason text,
  add column banned_by  uuid references public.users (id) on delete set null,
  add column banned_at  timestamptz,
  add column birthday   date,
  add column gender     text check (gender in ('male','female','non_binary','prefer_not_to_say')
                                    or gender is null);

create index idx_users_status on public.users (status);

-- Backfill: existing deactivated users keep their state under the new model.
update public.users set status = 'deactivated' where is_active = false;

-- Keep is_active (the "can log in" flag the whole app already checks) derived
-- from status, whichever one a writer touches.
create or replace function public.sync_user_status()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.is_active := (new.status = 'active');
    if new.status = 'banned' then
      new.banned_at := coalesce(new.banned_at, now());
    else
      new.ban_reason := null;
      new.banned_by := null;
      new.banned_at := null;
    end if;
    if new.status <> 'active' and new.deleted_at is null and old.status = 'active' then
      -- soft-delete timestamp only applies to deactivation, not bans
      if new.status = 'deactivated' then new.deleted_at := now(); end if;
    end if;
    if new.status = 'active' then new.deleted_at := null; end if;
  elsif new.is_active is distinct from old.is_active then
    new.status := case when new.is_active then 'active' else 'deactivated' end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_user_status on public.users;
create trigger trg_sync_user_status before update on public.users
  for each row execute function public.sync_user_status();

-- protect_user_fields (0001) blocks non-admin changes to role/is_active/deleted_at;
-- extend it to the new status/ban columns.
create or replace function public.protect_user_fields()
returns trigger language plpgsql as $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;
  if new.role_id is distinct from old.role_id
     or new.is_active is distinct from old.is_active
     or new.deleted_at is distinct from old.deleted_at
     or new.status is distinct from old.status
     or new.ban_reason is distinct from old.ban_reason
     or new.banned_by is distinct from old.banned_by
     or new.banned_at is distinct from old.banned_at then
    raise exception 'You are not allowed to change role or account status';
  end if;
  return new;
end;
$$;

-- ── Personal pins (per-admin favorites, NOT a global flag) ───────────────────
create table public.user_pins (
  id             uuid primary key default gen_random_uuid(),
  pinned_by      uuid not null references public.users (id) on delete cascade,
  pinned_user_id uuid not null references public.users (id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (pinned_by, pinned_user_id)
);
create index idx_user_pins_owner on public.user_pins (pinned_by);

grant select, insert, delete on public.user_pins to authenticated;
alter table public.user_pins enable row level security;
create policy user_pins_own on public.user_pins for all to authenticated
  using (pinned_by = auth.uid()) with check (pinned_by = auth.uid());

-- ── Per-user-per-day activity rollup (heatmap source) ────────────────────────
create table public.user_activity_daily (
  user_id uuid not null references public.users (id) on delete cascade,
  day     date not null,
  logins  integer not null default 0,
  actions integer not null default 0,
  primary key (user_id, day)
);
create index idx_uad_day on public.user_activity_daily (day);

grant select on public.user_activity_daily to authenticated;
alter table public.user_activity_daily enable row level security;
-- Staff see only their own heatmap; Admin can open anyone's.
create policy uad_select on public.user_activity_daily for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Incremental maintenance: every activity_logs insert bumps the actor's daily
-- counter (logins counted separately via the auth.login action). SECURITY
-- DEFINER so the upsert succeeds regardless of the caller's RLS scope.
create or replace function public.bump_user_activity_daily()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.actor_id is null then
    return new;
  end if;
  insert into public.user_activity_daily (user_id, day, logins, actions)
  values (
    new.actor_id,
    (new.created_at at time zone 'utc')::date,
    case when new.action = 'auth.login' then 1 else 0 end,
    case when new.action = 'auth.login' then 0 else 1 end
  )
  on conflict (user_id, day) do update set
    logins  = public.user_activity_daily.logins
              + case when new.action = 'auth.login' then 1 else 0 end,
    actions = public.user_activity_daily.actions
              + case when new.action = 'auth.login' then 0 else 1 end;
  return new;
end;
$$;

drop trigger if exists trg_bump_user_activity on public.activity_logs;
create trigger trg_bump_user_activity after insert on public.activity_logs
  for each row execute function public.bump_user_activity_daily();

-- Backfill the rollup from existing history (one-time; fine on small dev data,
-- and on production this migration ships before the table grows further).
insert into public.user_activity_daily (user_id, day, logins, actions)
select
  actor_id,
  (created_at at time zone 'utc')::date,
  count(*) filter (where action = 'auth.login'),
  count(*) filter (where action <> 'auth.login')
from public.activity_logs
where actor_id is not null
group by actor_id, (created_at at time zone 'utc')::date
on conflict (user_id, day) do nothing;

-- Scheduled reconciliation (safety net), mirroring the CRM pattern: recompute
-- the last N days from the source of truth. Run via cron off-peak.
create or replace function public.reconcile_user_activity(p_days integer default 7)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  insert into public.user_activity_daily (user_id, day, logins, actions)
  select
    actor_id,
    (created_at at time zone 'utc')::date,
    count(*) filter (where action = 'auth.login'),
    count(*) filter (where action <> 'auth.login')
  from public.activity_logs
  where actor_id is not null
    and created_at >= now() - make_interval(days => p_days)
  group by actor_id, (created_at at time zone 'utc')::date
  on conflict (user_id, day) do update set
    logins = excluded.logins,
    actions = excluded.actions;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function public.reconcile_user_activity(integer) to service_role;
