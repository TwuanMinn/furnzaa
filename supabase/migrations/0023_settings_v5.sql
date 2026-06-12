-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Settings (Module 11) — permission keys for the four config sections that  ║
-- ║  lacked them, login-attempt tracking for the configurable lockout,         ║
-- ║  archive-before-purge flag + bucket, and customer_score_rules actually     ║
-- ║  wired into apply_order_to_crm (was hardcoded).                            ║
-- ║  MUST stay in sync with src/lib/rbac/permissions.ts.                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

insert into public.permissions (key, description, module) values
  ('settings.edit_messaging', 'Edit messaging configuration (reactions, invite links, @all)', 'settings'),
  ('settings.edit_inventory', 'Edit inventory configuration (SKU/barcode/warehouse/alerts)',  'settings'),
  ('settings.edit_loyalty',   'Edit loyalty configuration (score rules, voucher defaults)',   'settings'),
  ('settings.edit_marketing', 'Edit marketing configuration (sender, tracking, quiet hours)', 'settings')
on conflict (key) do update set description = excluded.description, module = excluded.module;

-- Admin → everything (idempotent catch-up for the new keys).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'admin'
on conflict do nothing;

-- ── Login attempts (drives login_attempt_limit / lockout_minutes) ────────────
-- Written by the sign-in action via the service role on every attempt; counted
-- over the lockout window before each sign-in. No client access at all.
create table if not exists public.login_attempts (
  id           bigint generated always as identity primary key,
  email        text not null,
  success      boolean not null,
  ip_address   text,
  attempted_at timestamptz not null default now()
);
create index if not exists idx_login_attempts_email_time
  on public.login_attempts (lower(email), attempted_at desc);
alter table public.login_attempts enable row level security;
-- No policies and no grants: service_role only by design.

-- ── Archive-before-purge flag + private archives bucket ──────────────────────
alter table public.organization_settings
  add column if not exists log_purge_archive boolean not null default true;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('archives', 'archives', false, 52428800, array['text/csv'])
on conflict (id) do nothing;
-- Service-role writes only (no storage.objects policies for authenticated).

-- ── customer_score_rules wired into the CRM engine ───────────────────────────
-- Same body as 0008 except the score increment now reads the configurable
-- rules: points_per_order + points_per_100_currency (defaults preserve the old
-- hardcoded behaviour: 1pt/order + 1pt per 100 currency units).
create or replace function public.apply_order_to_crm(p_order_id uuid)
returns table (applied boolean, customer_id uuid, tier_changed boolean,
               previous_tier_id uuid, new_tier_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  o record;
  t record;
  v_rules jsonb;
  v_pts_order numeric;
  v_pts_per_100 numeric;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    raise exception 'Order % not found', p_order_id;
  end if;
  if o.crm_applied_at is not null then
    return query select false, o.customer_id, false, null::uuid, null::uuid;  -- already applied
    return;
  end if;
  if o.status <> 'delivered' or o.payment_status <> 'paid' then
    return query select false, o.customer_id, false, null::uuid, null::uuid;
    return;
  end if;

  select customer_score_rules into v_rules from public.organization_settings where id = 'org';
  v_pts_order   := coalesce((v_rules->>'points_per_order')::numeric, 1);
  v_pts_per_100 := coalesce((v_rules->>'points_per_100_currency')::numeric, 1);

  update public.customers set
    lifetime_spend_cents = lifetime_spend_cents + o.total_cents,
    annual_spend_cents   = case
      when last_purchase_date is not null
       and extract(year from last_purchase_date) = extract(year from current_date)
      then annual_spend_cents + o.total_cents
      else o.total_cents          -- first purchase this year resets the annual window
    end,
    order_count          = order_count + 1,
    last_purchase_date   = greatest(coalesce(last_purchase_date, current_date), current_date),
    customer_score       = customer_score + (o.total_cents / 10000.0) * v_pts_per_100 + v_pts_order
  where id = o.customer_id;

  update public.orders set crm_applied_at = now() where id = p_order_id;

  select * into t from public.evaluate_customer_tier(o.customer_id);
  return query select true, o.customer_id, t.changed, t.previous_tier_id, t.new_tier_id;
end;
$$;
grant execute on function public.apply_order_to_crm(uuid) to authenticated, service_role;
