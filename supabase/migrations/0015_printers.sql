-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Printer catalog + print tracking (spec v4, Module 2).                     ║
-- ║   • printers — Admin-managed brand + model catalog (replaces the           ║
-- ║     settings-JSON printer list). Orders reference it by FK, so brands/     ║
-- ║     models are added in Settings without code changes. The order form's    ║
-- ║     cascading combobox narrows models by brand.                            ║
-- ║   • orders.print_state (not_started/printing/completed/failed) lives       ║
-- ║     ALONGSIDE the configurable order status list, with print_started_at    ║
-- ║     driving the live countdown; print_deadline_notified_at makes the       ║
-- ║     countdown-zero notification idempotent.                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create table public.printers (
  id          uuid primary key default gen_random_uuid(),
  brand       text not null,
  model       text not null,
  badge_color text not null default 'slate',
  is_active   boolean not null default true,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (brand, model)
);
create index idx_printers_brand on public.printers (brand);
create trigger trg_printers_updated before update on public.printers
  for each row execute function public.set_updated_at();

grant select, insert, update on public.printers to authenticated;
alter table public.printers enable row level security;
create policy printers_select on public.printers for select to authenticated using (true);
create policy printers_insert on public.printers for insert to authenticated
  with check (public.is_admin());
create policy printers_update on public.printers for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Seed: full Bambu Lab lineup + example brands (Flashforge, Elegoo, Atom).
insert into public.printers (brand, model, badge_color) values
  ('Bambu Lab', 'A1 Mini', 'slate'),
  ('Bambu Lab', 'A1',      'slate'),
  ('Bambu Lab', 'A2L',     'slate'),
  ('Bambu Lab', 'P1S',     'blue'),
  ('Bambu Lab', 'P2S',     'blue'),
  ('Bambu Lab', 'X1C',     'indigo'),
  ('Bambu Lab', 'X1E',     'indigo'),
  ('Bambu Lab', 'X2D',     'indigo'),
  ('Bambu Lab', 'H2D',     'violet'),
  ('Bambu Lab', 'H2S',     'violet'),
  ('Bambu Lab', 'H2C',     'violet'),
  ('Flashforge', 'Adventurer 5M', 'amber'),
  ('Flashforge', 'AD5X',          'amber'),
  ('Elegoo', 'Neptune 4 Pro', 'green'),
  ('Elegoo', 'Centauri Carbon', 'green'),
  ('Atom', 'Atom 2', 'red')
on conflict (brand, model) do nothing;

-- ── Orders: printer FK + print tracking ──────────────────────────────────────
alter table public.orders
  add column printer_id uuid references public.printers (id) on delete set null,
  add column print_state text not null default 'not_started'
             check (print_state in ('not_started','printing','completed','failed')),
  add column print_started_at timestamptz,
  add column print_deadline_notified_at timestamptz;

create index idx_orders_printer on public.orders (printer_id);
-- "Now printing" widget + due-notification scans touch only active prints:
create index idx_orders_printing on public.orders (print_started_at)
  where print_state = 'printing';

-- Backfill printer_id from the old settings-key column, then drop it.
update public.orders o
set printer_id = p.id
from public.printers p
where p.brand = 'Bambu Lab'
  and o.printer_type is not null
  and lower(replace(replace(p.model, ' ', '_'), '-', '_')) = o.printer_type;

-- mv_printer_stats (0013) groups by the old text column — rebuild it on the
-- printer FK with brand/model labels straight from the catalog.
drop materialized view public.mv_printer_stats;

drop index if exists public.idx_orders_printer_type;
alter table public.orders drop column printer_type;

-- The settings-JSON printer list is superseded by the printers table.
alter table public.organization_settings drop column printer_types;

create materialized view public.mv_printer_stats as
select
  o.printer_id,
  pr.brand,
  pr.model,
  pr.badge_color,
  count(*)::bigint as orders_count,
  sum(o.total_cents)::bigint as revenue_cents,
  sum(o.material_cost_cents)::bigint as material_cost_cents,
  sum(o.actual_print_minutes)::bigint as print_minutes,
  sum(o.filament_used_grams)::numeric as filament_grams
from public.orders o
join public.printers pr on pr.id = o.printer_id
where o.status = 'delivered' and o.payment_status = 'paid' and o.is_active
  and o.printer_id is not null
group by o.printer_id, pr.brand, pr.model, pr.badge_color;

create unique index uq_mv_printer_stats on public.mv_printer_stats (printer_id);

-- ── Due print-countdown notifications (idempotent claim for the runner) ─────
-- Returns orders whose countdown (started + estimated minutes) has elapsed and
-- stamps them in the same statement, so concurrent runner ticks can never
-- notify twice.
create or replace function public.claim_due_print_notifications(p_limit integer default 100)
returns table (
  order_id uuid,
  order_code text,
  assigned_staff_id uuid,
  estimated_print_minutes integer
)
language sql security definer set search_path = public as $$
  update public.orders o
  set print_deadline_notified_at = now()
  from (
    select id from public.orders
    where print_state = 'printing'
      and print_deadline_notified_at is null
      and estimated_print_minutes is not null
      and estimated_print_minutes > 0
      and print_started_at + make_interval(mins => estimated_print_minutes) <= now()
    order by print_started_at
    limit p_limit
    for update skip locked
  ) due
  where o.id = due.id
  returning o.id, o.order_code, o.assigned_staff_id, o.estimated_print_minutes;
$$;
grant execute on function public.claim_due_print_notifications(integer) to service_role;
