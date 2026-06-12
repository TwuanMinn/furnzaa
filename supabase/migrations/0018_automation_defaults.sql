-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Marketing automation defaults (spec v4, Module 6).                        ║
-- ║   • customers_with_birthday_today() — rides the (month, day) expression    ║
-- ║     index from 0008 so the birthday rule never scans 1M rows in the app.   ║
-- ║   • Seeds the five spec'd default rules (idempotent by name).              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create or replace function public.customers_with_birthday_today(p_limit integer default 1000)
returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name
  from public.customers c
  where c.birthday is not null
    and c.is_active
    and extract(month from c.birthday) = extract(month from current_date)
    and extract(day from c.birthday) = extract(day from current_date)
  limit p_limit;
$$;
revoke execute on function public.customers_with_birthday_today(integer) from public, anon, authenticated;
grant execute on function public.customers_with_birthday_today(integer) to service_role;

-- Default rules (disabled-safe: all enabled, idempotent via execution dedupe).
insert into public.automation_rules (name, event_type, condition, action_type, action_config)
select * from (values
  ('Gold welcome voucher', 'tier_reached',
   '{"tier_key":"gold"}'::jsonb, 'issue_voucher',
   '{"type":"fixed","value_cents":2500,"valid_days":60}'::jsonb),
  ('Diamond welcome package', 'tier_reached',
   '{"tier_key":"standard_diamond"}'::jsonb, 'issue_voucher',
   '{"type":"fixed","value_cents":10000,"valid_days":90}'::jsonb),
  ('90-day reactivation coupon', 'inactivity',
   '{"days":90}'::jsonb, 'issue_voucher',
   '{"type":"percentage","value_percent":15,"valid_days":30}'::jsonb),
  ('Birthday voucher', 'birthday',
   '{}'::jsonb, 'issue_voucher',
   '{"type":"fixed","value_cents":1500,"valid_days":30}'::jsonb),
  ('Auto tier upgrade at 1,000 spend', 'spend_threshold',
   '{"amount_cents":100000}'::jsonb, 'upgrade_tier',
   '{}'::jsonb)
) as seed(name, event_type, condition, action_type, action_config)
where not exists (
  select 1 from public.automation_rules r where r.name = seed.name
);
