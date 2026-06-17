-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  MODULE 16 — Daily attendance.                                             ║
-- ║                                                                            ║
-- ║  attendance_days = one row per employee per DAY (present / absent / leave  ║
-- ║  / remote / half-day / holiday + hours + note). This is the source of      ║
-- ║  truth; the per-MONTH attendance_records row that calculate_payroll_run    ║
-- ║  reads is DERIVED from it — recomputed inside the writing transaction by   ║
-- ║  payroll_recompute_attendance_month() (same cache discipline as inventory/ ║
-- ║  ROI aggregates). Writes flow ONLY through set_attendance_day /            ║
-- ║  delete_attendance_day (SECURITY DEFINER, attendance.manage) so the        ║
-- ║  monthly rollup can never drift. RLS: admin / payroll.view_all see all;    ║
-- ║  a linked staff member sees only their own days.                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 1. Daily attendance table ─────────────────────────────────────────────────
create table public.attendance_days (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees (id) on delete cascade,
  work_date      date not null,
  status         text not null default 'present'
                 check (status in ('present', 'absent', 'leave_paid', 'leave_unpaid', 'remote', 'half_day', 'holiday')),
  hours_worked   numeric(6,2) not null default 0,
  overtime_hours numeric(6,2) not null default 0,
  note           text,
  source         text not null default 'manual' check (source in ('manual', 'import')),
  created_by     uuid references public.users (id) on delete set null,
  updated_by     uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (employee_id, work_date)
);
create index idx_attendance_days_date on public.attendance_days (work_date);
create index idx_attendance_days_emp_date on public.attendance_days (employee_id, work_date);
create trigger trg_attendance_days_updated before update on public.attendance_days
  for each row execute function public.set_updated_at();

alter table public.attendance_days enable row level security;
create policy attendance_days_select on public.attendance_days for select to authenticated
  using (exists (
    select 1 from public.employees e where e.id = employee_id
      and (public.is_admin() or public.has_permission('payroll.view_all')
           or (public.has_permission('payroll.view_own') and e.user_id = auth.uid()))
  ));
-- Writes flow through the RPCs only (no insert/update/delete grant).
grant select on public.attendance_days to authenticated;

-- ── 2. Monthly rollup: recompute attendance_records from the daily rows ───────
create or replace function public.payroll_recompute_attendance_month(p_employee_id uuid, p_month date)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_days numeric; v_hours numeric; v_ot numeric;
  v_lp numeric; v_lu numeric; v_abs numeric;
begin
  select
    coalesce(sum(case status when 'present' then 1 when 'remote' then 1 when 'half_day' then 0.5 else 0 end), 0),
    coalesce(sum(hours_worked), 0),
    coalesce(sum(overtime_hours), 0),
    count(*) filter (where status = 'leave_paid'),
    count(*) filter (where status = 'leave_unpaid'),
    count(*) filter (where status = 'absent')
  into v_days, v_hours, v_ot, v_lp, v_lu, v_abs
  from public.attendance_days
  where employee_id = p_employee_id and date_trunc('month', work_date)::date = v_month;

  insert into public.attendance_records
    (employee_id, period_month, days_worked, hours_worked, overtime_hours,
     leave_days_paid, leave_days_unpaid, absences, source, created_by)
  values
    (p_employee_id, v_month, v_days, v_hours, v_ot, v_lp, v_lu, v_abs, 'manual', auth.uid())
  on conflict (employee_id, period_month) do update set
    days_worked       = excluded.days_worked,
    hours_worked      = excluded.hours_worked,
    overtime_hours    = excluded.overtime_hours,
    leave_days_paid   = excluded.leave_days_paid,
    leave_days_unpaid = excluded.leave_days_unpaid,
    absences          = excluded.absences,
    source            = 'manual',
    updated_at        = now();
end;
$$;
grant execute on function public.payroll_recompute_attendance_month(uuid, date) to service_role;
revoke execute on function public.payroll_recompute_attendance_month(uuid, date) from public, anon, authenticated;

-- ── 3. Upsert a day + recompute its month (the ONLY write path) ───────────────
create or replace function public.set_attendance_day(
  p_employee_id uuid,
  p_work_date   date,
  p_status      text,
  p_hours       numeric default 0,
  p_ot          numeric default 0,
  p_note        text default null
) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare
  v_id uuid;
begin
  perform public.assert_any_permission('attendance.manage');
  if p_status not in ('present', 'absent', 'leave_paid', 'leave_unpaid', 'remote', 'half_day', 'holiday') then
    raise exception 'Invalid attendance status %', p_status;
  end if;
  if not exists (select 1 from public.employees where id = p_employee_id and deleted_at is null) then
    raise exception 'Employee % not found', p_employee_id;
  end if;

  insert into public.attendance_days
    (employee_id, work_date, status, hours_worked, overtime_hours, note, created_by, updated_by)
  values
    (p_employee_id, p_work_date, p_status, coalesce(p_hours, 0), coalesce(p_ot, 0), p_note, auth.uid(), auth.uid())
  on conflict (employee_id, work_date) do update set
    status         = excluded.status,
    hours_worked   = excluded.hours_worked,
    overtime_hours = excluded.overtime_hours,
    note           = excluded.note,
    updated_by     = auth.uid(),
    updated_at     = now()
  returning id into v_id;

  perform public.payroll_recompute_attendance_month(p_employee_id, p_work_date);
  return v_id;
end;
$$;
grant execute on function public.set_attendance_day(uuid, date, text, numeric, numeric, text) to authenticated, service_role;
revoke execute on function public.set_attendance_day(uuid, date, text, numeric, numeric, text) from public, anon;

-- ── 4. Delete a day + recompute its month ─────────────────────────────────────
create or replace function public.delete_attendance_day(p_id uuid)
returns boolean
language plpgsql security definer set search_path to 'public' as $$
declare
  v_emp uuid; v_date date;
begin
  perform public.assert_any_permission('attendance.manage');
  select employee_id, work_date into v_emp, v_date from public.attendance_days where id = p_id;
  if not found then return false; end if;
  delete from public.attendance_days where id = p_id;
  perform public.payroll_recompute_attendance_month(v_emp, v_date);
  return true;
end;
$$;
grant execute on function public.delete_attendance_day(uuid) to authenticated, service_role;
revoke execute on function public.delete_attendance_day(uuid) from public, anon;

-- ── 5. Demo seed (best-effort: only if employees already exist) ───────────────
do $$
declare e record; d date;
begin
  if exists (select 1 from public.employees where deleted_at is null) then
    for e in select id from public.employees where deleted_at is null limit 50 loop
      for d in
        select gs::date from generate_series(date '2026-06-01', date '2026-06-20', interval '1 day') gs
        where extract(dow from gs) between 1 and 5
      loop
        insert into public.attendance_days (employee_id, work_date, status, hours_worked, overtime_hours)
        values (
          e.id, d,
          case when d = date '2026-06-05' then 'absent'
               when d = date '2026-06-09' then 'leave_paid'
               when d = date '2026-06-16' then 'remote'
               else 'present' end,
          case when d in (date '2026-06-05', date '2026-06-09') then 0 else 8 end,
          case when extract(day from d)::int % 7 = 0 then 2 else 0 end
        )
        on conflict (employee_id, work_date) do nothing;
      end loop;
      perform public.payroll_recompute_attendance_month(e.id, date '2026-06-01');
    end loop;
  end if;
end $$;

notify pgrst, 'reload schema';
