-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  MODULE 16 — PAYROLL.                                                       ║
-- ║                                                                            ║
-- ║  Employees + effective-dated salary structures + attendance + monthly      ║
-- ║  payroll runs (Draft→Calculated→Approved→Paid→Closed) + IMMUTABLE          ║
-- ║  payroll_items snapshots + payslips + a pre-aggregated monthly rollup.     ║
-- ║                                                                            ║
-- ║  MOST access-sensitive module: admin (payroll.view_all) manages all; staff ║
-- ║  (payroll.view_own) see ONLY their own employee row + payslip data via     ║
-- ║  employees.user_id = auth.uid(). Bank details masked in the activity log   ║
-- ║  (caller-side). Approved runs are IMMUTABLE — corrections go through an     ║
-- ║  adjustment run, enforced by a trigger. Separation of duties: distinct     ║
-- ║  perms gate calculate / approve / pay.                                      ║
-- ║                                                                            ║
-- ║  MONEY: ×100 bigint cents. Analytics read payroll_monthly_rollup (frozen   ║
-- ║  at Approve) — never a live scan over payroll_items.                       ║
-- ║  PERMISSIONS: MUST stay in sync with src/lib/rbac/permissions.ts.          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 1. Permission seed ────────────────────────────────────────────────────────
insert into public.permissions (key, description, module) values
  ('payroll.view_all',       'View & manage all payroll',              'payroll'),
  ('payroll.view_own',       'View own payslips (self-service)',        'payroll'),
  ('payroll.manage',         'Manage employees & salary structures',    'payroll'),
  ('attendance.manage',      'Record attendance',                       'payroll'),
  ('payroll.run',            'Calculate payroll runs',                  'payroll'),
  ('payroll.approve',        'Approve payroll runs',                    'payroll'),
  ('payroll.pay',            'Mark payroll runs paid',                  'payroll'),
  ('payslip.generate',       'Generate payslips',                       'payroll'),
  ('payroll.analytics_view', 'View salary-cost analytics',              'payroll'),
  ('payroll.config',         'Edit payroll / HR configuration',         'payroll'),
  ('settings.edit_payroll',  'Edit payroll / HR configuration',         'settings')
on conflict (key) do update set description = excluded.description, module = excluded.module;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'admin'
on conflict do nothing;

-- Staff get self-service payslip access only.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.key = 'staff' and p.key = 'payroll.view_own'
on conflict do nothing;

-- ── 2. Reference / config tables ──────────────────────────────────────────────
create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  color       text not null default 'slate',
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index uq_departments_name on public.departments (lower(name)) where deleted_at is null;
create trigger trg_departments_updated before update on public.departments
  for each row execute function public.set_updated_at();

-- Tax rule: flat % of taxable base, fixed amount, or none. (Brackets → v2.)
create table public.tax_profiles (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  kind         text not null default 'none' check (kind in ('none', 'flat', 'fixed')),
  rate_percent numeric(6,3) not null default 0,    -- when kind='flat'
  fixed_cents  bigint not null default 0,          -- when kind='fixed'
  is_active    boolean not null default true,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger trg_tax_profiles_updated before update on public.tax_profiles
  for each row execute function public.set_updated_at();

-- Employer-side contribution: flat % of gross (social insurance / benefits).
create table public.employer_contribution_profiles (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  rate_percent numeric(6,3) not null default 0,
  is_active    boolean not null default true,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger trg_employer_profiles_updated before update on public.employer_contribution_profiles
  for each row execute function public.set_updated_at();

grant select, insert, update on public.departments to authenticated;
grant select, insert, update on public.tax_profiles to authenticated;
grant select, insert, update on public.employer_contribution_profiles to authenticated;
alter table public.departments enable row level security;
alter table public.tax_profiles enable row level security;
alter table public.employer_contribution_profiles enable row level security;
-- Config labels/rates: readable by any signed-in user; Admin-managed writes.
create policy departments_select on public.departments for select to authenticated using (true);
create policy departments_write  on public.departments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy tax_profiles_select on public.tax_profiles for select to authenticated using (true);
create policy tax_profiles_write  on public.tax_profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy emp_profiles_select on public.employer_contribution_profiles for select to authenticated using (true);
create policy emp_profiles_write  on public.employer_contribution_profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── 3. Employees ──────────────────────────────────────────────────────────────
create table public.employees (
  id              uuid primary key default gen_random_uuid(),
  employee_code   text not null,
  user_id         uuid references public.users (id) on delete set null,  -- links to an app user for self-service
  full_name       text not null check (length(trim(full_name)) > 0),
  position        text not null default '',
  department_id   uuid references public.departments (id) on delete set null,
  employment_type text not null default 'full_time',
  hire_date       date,
  status          text not null default 'active' check (status in ('active', 'on_leave', 'terminated')),
  email           text,
  phone           text,
  bank_account    text,   -- sensitive: masked before activity-log insert
  bank_name       text,
  notes           text,
  is_active       boolean not null default true,
  deleted_at      timestamptz,
  created_by      uuid references public.users (id) on delete set null,
  updated_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index uq_employees_code on public.employees (lower(employee_code)) where deleted_at is null;
create index idx_employees_name_trgm on public.employees using gin (full_name extensions.gin_trgm_ops);
create index idx_employees_name on public.employees (full_name, id) where deleted_at is null;
create index idx_employees_created on public.employees (created_at desc, id) where deleted_at is null;
create index idx_employees_department on public.employees (department_id);
create index idx_employees_type on public.employees (employment_type);
create index idx_employees_status on public.employees (status);
create index idx_employees_user on public.employees (user_id);
create trigger trg_employees_updated before update on public.employees
  for each row execute function public.set_updated_at();

alter table public.employees enable row level security;
create policy employees_select on public.employees for select to authenticated
  using (
    public.is_admin()
    or public.has_permission('payroll.view_all')
    or (public.has_permission('payroll.view_own') and user_id = auth.uid())
  );
create policy employees_insert on public.employees for insert to authenticated
  with check (public.has_permission('payroll.manage'));
create policy employees_update on public.employees for update to authenticated
  using (public.has_permission('payroll.manage')) with check (public.has_permission('payroll.manage'));
grant select, insert, update on public.employees to authenticated;

-- ── 4. Salary structures (effective-dated; new row per change, never edited) ──
create table public.salary_structures (
  id                              uuid primary key default gen_random_uuid(),
  employee_id                     uuid not null references public.employees (id) on delete cascade,
  effective_from                  date not null,
  pay_basis                       text not null default 'salaried' check (pay_basis in ('salaried', 'hourly')),
  base_salary_cents               bigint not null default 0,
  hourly_rate_cents               bigint not null default 0,
  overtime_rate_cents             bigint not null default 0,
  recurring_allowances            jsonb not null default '[]'::jsonb,  -- [{label, amount_cents, taxable}]
  recurring_deductions            jsonb not null default '[]'::jsonb,  -- [{label, amount_cents, pre_tax}]
  tax_profile_id                  uuid references public.tax_profiles (id) on delete set null,
  employer_contribution_profile_id uuid references public.employer_contribution_profiles (id) on delete set null,
  standard_working_days           integer not null default 22,
  created_by                      uuid references public.users (id) on delete set null,
  created_at                      timestamptz not null default now()
);
create index idx_salary_struct_employee on public.salary_structures (employee_id, effective_from desc);
alter table public.salary_structures enable row level security;
create policy salary_struct_select on public.salary_structures for select to authenticated
  using (exists (
    select 1 from public.employees e where e.id = employee_id
      and (public.is_admin() or public.has_permission('payroll.view_all')
           or (public.has_permission('payroll.view_own') and e.user_id = auth.uid()))
  ));
create policy salary_struct_insert on public.salary_structures for insert to authenticated
  with check (public.has_permission('payroll.manage'));
grant select, insert on public.salary_structures to authenticated;

-- ── 5. Attendance (one row per employee per period) ───────────────────────────
create table public.attendance_records (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.employees (id) on delete cascade,
  period_month     date not null,
  days_worked      numeric(6,2) not null default 0,
  hours_worked     numeric(8,2) not null default 0,
  overtime_hours   numeric(8,2) not null default 0,
  leave_days_paid  numeric(6,2) not null default 0,
  leave_days_unpaid numeric(6,2) not null default 0,
  absences         numeric(6,2) not null default 0,
  notes            text,
  source           text not null default 'manual' check (source in ('manual', 'import')),
  created_by       uuid references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (employee_id, period_month)
);
create index idx_attendance_period on public.attendance_records (period_month);
create index idx_attendance_emp_period on public.attendance_records (employee_id, period_month);
create trigger trg_attendance_updated before update on public.attendance_records
  for each row execute function public.set_updated_at();
alter table public.attendance_records enable row level security;
create policy attendance_select on public.attendance_records for select to authenticated
  using (exists (
    select 1 from public.employees e where e.id = employee_id
      and (public.is_admin() or public.has_permission('payroll.view_all')
           or (public.has_permission('payroll.view_own') and e.user_id = auth.uid()))
  ));
create policy attendance_write on public.attendance_records for all to authenticated
  using (public.has_permission('attendance.manage')) with check (public.has_permission('attendance.manage'));
grant select, insert, update on public.attendance_records to authenticated;

-- ── 6. Payroll runs (the monthly batch; totals frozen at Calculate) ───────────
create table public.payroll_runs (
  id                        uuid primary key default gen_random_uuid(),
  period_month              date not null,
  name                      text not null default '',
  status                    text not null default 'draft'
                            check (status in ('draft', 'calculated', 'approved', 'paid', 'closed')),
  run_type                  text not null default 'regular'
                            check (run_type in ('regular', 'adjustment', 'off_cycle')),
  headcount                 integer not null default 0,
  total_gross_cents         bigint not null default 0,
  total_deductions_cents    bigint not null default 0,
  total_tax_cents           bigint not null default 0,
  total_net_cents           bigint not null default 0,
  total_employer_cost_cents bigint not null default 0,
  total_overtime_cost_cents bigint not null default 0,
  calculated_at             timestamptz,
  calculated_by             uuid references public.users (id) on delete set null,
  approved_at               timestamptz,
  approved_by               uuid references public.users (id) on delete set null,
  paid_at                   timestamptz,
  paid_by                   uuid references public.users (id) on delete set null,
  closed_at                 timestamptz,
  notes                     text,
  created_by                uuid references public.users (id) on delete set null,
  updated_by                uuid references public.users (id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index idx_payroll_runs_period on public.payroll_runs (period_month desc, id);
create index idx_payroll_runs_status on public.payroll_runs (status);
create index idx_payroll_runs_created on public.payroll_runs (created_at desc, id);
create trigger trg_payroll_runs_updated before update on public.payroll_runs
  for each row execute function public.set_updated_at();
alter table public.payroll_runs enable row level security;
-- Runs are admin/payroll-staff only (staff never see runs — only their payslips).
create policy payroll_runs_select on public.payroll_runs for select to authenticated
  using (public.is_admin() or public.has_permission('payroll.view_all'));
create policy payroll_runs_insert on public.payroll_runs for insert to authenticated
  with check (public.has_permission('payroll.manage'));
-- Editing name/notes of a non-locked run; status transitions go through the RPCs.
create policy payroll_runs_update on public.payroll_runs for update to authenticated
  using (public.has_permission('payroll.manage') and status in ('draft', 'calculated'))
  with check (public.has_permission('payroll.manage'));
grant select, insert on public.payroll_runs to authenticated;
grant update (name, notes, run_type, updated_by) on public.payroll_runs to authenticated;

-- ── 7. Payroll items (IMMUTABLE snapshot per employee per run) ────────────────
create table public.payroll_items (
  id                       uuid primary key default gen_random_uuid(),
  payroll_run_id           uuid not null references public.payroll_runs (id) on delete cascade,
  employee_id              uuid not null references public.employees (id) on delete restrict,
  pay_basis                text not null,
  base_salary_cents        bigint not null default 0,
  hourly_rate_cents        bigint not null default 0,
  overtime_rate_cents      bigint not null default 0,
  days_worked              numeric(8,2) not null default 0,
  hours_worked             numeric(8,2) not null default 0,
  overtime_hours           numeric(8,2) not null default 0,
  leave_days_unpaid        numeric(6,2) not null default 0,
  absences                 numeric(6,2) not null default 0,
  allowances               jsonb not null default '[]'::jsonb,
  deductions               jsonb not null default '[]'::jsonb,
  bonuses                  jsonb not null default '[]'::jsonb,
  commissions              jsonb not null default '[]'::jsonb,
  tax_profile_snapshot     jsonb not null default '{}'::jsonb,
  employer_profile_snapshot jsonb not null default '{}'::jsonb,
  gross_cents              bigint not null default 0,
  total_deductions_cents   bigint not null default 0,
  total_tax_cents          bigint not null default 0,
  net_cents                bigint not null default 0,
  employer_cost_cents      bigint not null default 0,
  overtime_pay_cents       bigint not null default 0,
  status                   text not null default 'pending' check (status in ('pending', 'paid')),
  notes                    text,
  created_at               timestamptz not null default now(),
  unique (payroll_run_id, employee_id)
);
create index idx_payroll_items_run on public.payroll_items (payroll_run_id, id);
create index idx_payroll_items_employee on public.payroll_items (employee_id);
alter table public.payroll_items enable row level security;
create policy payroll_items_select on public.payroll_items for select to authenticated
  using (
    public.is_admin() or public.has_permission('payroll.view_all')
    or (public.has_permission('payroll.view_own')
        and exists (select 1 from public.employees e where e.id = employee_id and e.user_id = auth.uid()))
  );
-- No insert/update/delete grant: items are written ONLY by calculate_payroll_run
-- (SECURITY DEFINER) and frozen by the immutability trigger once approved.
grant select on public.payroll_items to authenticated;

-- Immutability: once the parent run is approved/paid/closed, no writes (insert,
-- update or delete) to its items. Calculate runs only while draft/calculated.
create or replace function public.enforce_payroll_item_immutable()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_status text;
  v_run    uuid := coalesce(NEW.payroll_run_id, OLD.payroll_run_id);
begin
  select status into v_status from public.payroll_runs where id = v_run;
  if v_status in ('approved', 'paid', 'closed') then
    raise exception 'Payroll items are immutable once the run is approved (run %). Use an adjustment run.', v_run
      using errcode = '42501';
  end if;
  return coalesce(NEW, OLD);
end;
$$;
create trigger trg_payroll_items_immutable
  before insert or update or delete on public.payroll_items
  for each row execute function public.enforce_payroll_item_immutable();

-- ── 8. Payslips ───────────────────────────────────────────────────────────────
create table public.payslips (
  id               uuid primary key default gen_random_uuid(),
  payroll_item_id  uuid not null unique references public.payroll_items (id) on delete cascade,
  employee_id      uuid not null references public.employees (id) on delete cascade,
  period_month     date not null,
  pdf_storage_path text,
  status           text not null default 'generated' check (status in ('generated', 'sent', 'viewed')),
  generated_at     timestamptz not null default now(),
  created_by       uuid references public.users (id) on delete set null
);
create index idx_payslips_employee on public.payslips (employee_id, period_month desc);
create index idx_payslips_period on public.payslips (period_month);
alter table public.payslips enable row level security;
create policy payslips_select on public.payslips for select to authenticated
  using (
    public.is_admin() or public.has_permission('payroll.view_all')
    or (public.has_permission('payroll.view_own')
        and exists (select 1 from public.employees e where e.id = employee_id and e.user_id = auth.uid()))
  );
-- Written via the generate action on the service-role client.
grant select on public.payslips to authenticated;

-- ── 9. Monthly rollup (pre-aggregated; recomputed at Approve) ─────────────────
create table public.payroll_monthly_rollup (
  id                        uuid primary key default gen_random_uuid(),
  period_month              date not null,
  department_id             uuid references public.departments (id) on delete set null,  -- null = company-wide
  headcount                 integer not null default 0,
  total_gross_cents         bigint not null default 0,
  total_net_cents           bigint not null default 0,
  total_deductions_cents    bigint not null default 0,
  total_tax_cents           bigint not null default 0,
  total_employer_cost_cents bigint not null default 0,
  total_overtime_cost_cents bigint not null default 0,
  avg_net_cents             bigint not null default 0,
  updated_at                timestamptz not null default now(),
  unique (period_month, department_id)
);
create index idx_payroll_rollup_period on public.payroll_monthly_rollup (period_month desc);
alter table public.payroll_monthly_rollup enable row level security;
create policy payroll_rollup_select on public.payroll_monthly_rollup for select to authenticated
  using (public.is_admin() or public.has_permission('payroll.analytics_view') or public.has_permission('payroll.view_all'));
grant select on public.payroll_monthly_rollup to authenticated;

-- ── 10. Calculate RPC (batched-by-loop, idempotent: replaces a Draft's items) ─
create or replace function public.calculate_payroll_run(p_run_id uuid)
returns integer
language plpgsql security definer set search_path to 'public' as $$
declare
  v_run         public.payroll_runs%rowtype;
  v_period_end  date;
  v_count       integer := 0;
  e             public.employees%rowtype;
  s             public.salary_structures%rowtype;
  a             public.attendance_records%rowtype;
  v_base bigint; v_ot bigint; v_allow bigint; v_allow_nontax bigint; v_gross bigint;
  v_recur_ded bigint; v_pretax_ded bigint; v_absence_ded bigint;
  v_taxable bigint; v_tax bigint; v_total_ded bigint; v_net bigint;
  v_emp_rate numeric; v_emp_contrib bigint; v_emp_cost bigint;
  v_tax_kind text; v_tax_rate numeric; v_tax_fixed bigint;
begin
  perform public.assert_any_permission('payroll.run');

  select * into v_run from public.payroll_runs where id = p_run_id for update;
  if not found then raise exception 'Payroll run % not found', p_run_id; end if;
  if v_run.status not in ('draft', 'calculated') then
    raise exception 'Run is locked (%); calculate only a Draft/Calculated run', v_run.status;
  end if;
  v_period_end := (date_trunc('month', v_run.period_month) + interval '1 month' - interval '1 day')::date;

  delete from public.payroll_items where payroll_run_id = p_run_id;

  for e in select * from public.employees where status = 'active' and deleted_at is null loop
    select * into s from public.salary_structures
      where employee_id = e.id and effective_from <= v_period_end
      order by effective_from desc limit 1;
    if not found then continue; end if;

    select * into a from public.attendance_records
      where employee_id = e.id and period_month = date_trunc('month', v_run.period_month)::date;

    if s.pay_basis = 'hourly' then
      v_base := round(s.hourly_rate_cents * coalesce(a.hours_worked, 0))::bigint;
    else
      v_base := s.base_salary_cents;
    end if;
    v_ot := round(s.overtime_rate_cents * coalesce(a.overtime_hours, 0))::bigint;

    v_allow := coalesce((select sum((x->>'amount_cents')::bigint)
      from jsonb_array_elements(coalesce(s.recurring_allowances, '[]'::jsonb)) x), 0);
    v_allow_nontax := coalesce((select sum((x->>'amount_cents')::bigint)
      from jsonb_array_elements(coalesce(s.recurring_allowances, '[]'::jsonb)) x
      where coalesce((x->>'taxable')::boolean, true) = false), 0);

    v_gross := v_base + v_ot + v_allow;  -- one-off bonuses/commissions: v2

    v_recur_ded := coalesce((select sum((x->>'amount_cents')::bigint)
      from jsonb_array_elements(coalesce(s.recurring_deductions, '[]'::jsonb)) x), 0);
    v_pretax_ded := coalesce((select sum((x->>'amount_cents')::bigint)
      from jsonb_array_elements(coalesce(s.recurring_deductions, '[]'::jsonb)) x
      where coalesce((x->>'pre_tax')::boolean, false) = true), 0);

    if s.pay_basis = 'salaried' and s.standard_working_days > 0 then
      v_absence_ded := round((s.base_salary_cents::numeric / s.standard_working_days)
        * (coalesce(a.leave_days_unpaid, 0) + coalesce(a.absences, 0)))::bigint;
    else
      v_absence_ded := 0;
    end if;

    v_tax_kind := 'none'; v_tax_rate := 0; v_tax_fixed := 0;
    if s.tax_profile_id is not null then
      select kind, coalesce(rate_percent, 0), coalesce(fixed_cents, 0)
        into v_tax_kind, v_tax_rate, v_tax_fixed
        from public.tax_profiles where id = s.tax_profile_id;
    end if;
    v_taxable := greatest(0, v_gross - v_allow_nontax - v_pretax_ded);
    if v_tax_kind = 'flat' then v_tax := round(v_taxable * v_tax_rate / 100)::bigint;
    elsif v_tax_kind = 'fixed' then v_tax := v_tax_fixed;
    else v_tax := 0; end if;

    v_total_ded := v_recur_ded + v_absence_ded + v_tax;
    v_net := v_gross - v_total_ded;

    v_emp_rate := 0;
    if s.employer_contribution_profile_id is not null then
      select coalesce(rate_percent, 0) into v_emp_rate
        from public.employer_contribution_profiles where id = s.employer_contribution_profile_id;
    end if;
    v_emp_contrib := round(v_gross * coalesce(v_emp_rate, 0) / 100)::bigint;
    v_emp_cost := v_gross + v_emp_contrib;

    insert into public.payroll_items (
      payroll_run_id, employee_id, pay_basis, base_salary_cents, hourly_rate_cents, overtime_rate_cents,
      days_worked, hours_worked, overtime_hours, leave_days_unpaid, absences,
      allowances, deductions, tax_profile_snapshot, employer_profile_snapshot,
      gross_cents, total_deductions_cents, total_tax_cents, net_cents, employer_cost_cents, overtime_pay_cents
    ) values (
      p_run_id, e.id, s.pay_basis, s.base_salary_cents, s.hourly_rate_cents, s.overtime_rate_cents,
      coalesce(a.days_worked, 0), coalesce(a.hours_worked, 0), coalesce(a.overtime_hours, 0),
      coalesce(a.leave_days_unpaid, 0), coalesce(a.absences, 0),
      coalesce(s.recurring_allowances, '[]'::jsonb), coalesce(s.recurring_deductions, '[]'::jsonb),
      jsonb_build_object('kind', v_tax_kind, 'rate_percent', v_tax_rate, 'fixed_cents', v_tax_fixed),
      jsonb_build_object('rate_percent', coalesce(v_emp_rate, 0)),
      v_gross, v_total_ded, v_tax, v_net, v_emp_cost, v_ot
    );
    v_count := v_count + 1;
  end loop;

  update public.payroll_runs set
    status = 'calculated',
    calculated_at = now(),
    calculated_by = auth.uid(),
    headcount = v_count,
    total_gross_cents         = coalesce((select sum(gross_cents) from public.payroll_items where payroll_run_id = p_run_id), 0),
    total_deductions_cents    = coalesce((select sum(total_deductions_cents) from public.payroll_items where payroll_run_id = p_run_id), 0),
    total_tax_cents           = coalesce((select sum(total_tax_cents) from public.payroll_items where payroll_run_id = p_run_id), 0),
    total_net_cents           = coalesce((select sum(net_cents) from public.payroll_items where payroll_run_id = p_run_id), 0),
    total_employer_cost_cents = coalesce((select sum(employer_cost_cents) from public.payroll_items where payroll_run_id = p_run_id), 0),
    total_overtime_cost_cents = coalesce((select sum(overtime_pay_cents) from public.payroll_items where payroll_run_id = p_run_id), 0)
  where id = p_run_id;

  return v_count;
end;
$$;
grant execute on function public.calculate_payroll_run(uuid) to authenticated, service_role;
revoke execute on function public.calculate_payroll_run(uuid) from public, anon;

-- ── 11. Approve RPC (freeze + recompute the monthly rollup for the period) ────
create or replace function public.approve_payroll_run(p_run_id uuid)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  v_run public.payroll_runs%rowtype;
  v_month date;
begin
  perform public.assert_any_permission('payroll.approve');
  select * into v_run from public.payroll_runs where id = p_run_id for update;
  if not found then raise exception 'Payroll run % not found', p_run_id; end if;
  if v_run.status <> 'calculated' then raise exception 'Only a Calculated run can be approved'; end if;
  v_month := date_trunc('month', v_run.period_month)::date;

  update public.payroll_runs set status = 'approved', approved_at = now(), approved_by = auth.uid()
    where id = p_run_id;

  -- Recompute the rollup for this period across ALL approved+ runs (so an
  -- adjustment run in the same month rolls up together). Per-department + a
  -- company-wide (department_id null) row.
  delete from public.payroll_monthly_rollup where period_month = v_month;

  insert into public.payroll_monthly_rollup
    (period_month, department_id, headcount, total_gross_cents, total_net_cents,
     total_deductions_cents, total_tax_cents, total_employer_cost_cents, total_overtime_cost_cents, avg_net_cents)
  select v_month, e.department_id, count(*)::int,
    sum(pi.gross_cents), sum(pi.net_cents), sum(pi.total_deductions_cents), sum(pi.total_tax_cents),
    sum(pi.employer_cost_cents), sum(pi.overtime_pay_cents),
    (sum(pi.net_cents) / greatest(count(*), 1))::bigint
  from public.payroll_items pi
  join public.payroll_runs r on r.id = pi.payroll_run_id
    and date_trunc('month', r.period_month)::date = v_month and r.status in ('approved', 'paid', 'closed')
  join public.employees e on e.id = pi.employee_id
  group by e.department_id;

  insert into public.payroll_monthly_rollup
    (period_month, department_id, headcount, total_gross_cents, total_net_cents,
     total_deductions_cents, total_tax_cents, total_employer_cost_cents, total_overtime_cost_cents, avg_net_cents)
  select v_month, null, count(*)::int,
    sum(pi.gross_cents), sum(pi.net_cents), sum(pi.total_deductions_cents), sum(pi.total_tax_cents),
    sum(pi.employer_cost_cents), sum(pi.overtime_pay_cents),
    (sum(pi.net_cents) / greatest(count(*), 1))::bigint
  from public.payroll_items pi
  join public.payroll_runs r on r.id = pi.payroll_run_id
    and date_trunc('month', r.period_month)::date = v_month and r.status in ('approved', 'paid', 'closed')
  join public.employees e on e.id = pi.employee_id;
end;
$$;
grant execute on function public.approve_payroll_run(uuid) to authenticated, service_role;
revoke execute on function public.approve_payroll_run(uuid) from public, anon;

-- ── 12. Seed default config ───────────────────────────────────────────────────
insert into public.departments (name, color, sort_order) values
  ('Production', 'blue', 1), ('Design', 'violet', 2), ('Sales', 'green', 3),
  ('Logistics', 'amber', 4), ('Admin', 'slate', 5)
on conflict do nothing;
insert into public.tax_profiles (name, kind, rate_percent) values
  ('No tax', 'none', 0), ('Flat 10%', 'flat', 10)
on conflict do nothing;
insert into public.employer_contribution_profiles (name, rate_percent) values
  ('Standard (17.5%)', 17.5), ('None', 0)
on conflict do nothing;

-- ── 13. Private payslips storage bucket (admin/service-mediated access) ───────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('payslips', 'payslips', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
-- Direct object access is admin-only; staff receive server-generated signed URLs
-- after the payslips-row permission check (same model as receipts/attachments).
create policy payslips_obj_all on storage.objects for all to authenticated
  using (bucket_id = 'payslips' and public.is_admin())
  with check (bucket_id = 'payslips' and public.is_admin());

notify pgrst, 'reload schema';
