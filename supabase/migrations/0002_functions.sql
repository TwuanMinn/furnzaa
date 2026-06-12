-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Server-side SQL functions (RPCs) for scale-friendly operations.           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Atomic, gap-tolerant order-code generator. Format/prefix come from settings.
create or replace function public.next_order_code(p_prefix text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_prefix text;
  v_format text;
  v_year   text := to_char(now(), 'YYYY');
  v_key    text;
  v_seq    bigint;
begin
  select coalesce(p_prefix, order_code_prefix, 'FZ'), coalesce(order_code_format, '{prefix}-{yyyy}-{seq}')
    into v_prefix, v_format
  from public.organization_settings where id = 'org';

  v_prefix := coalesce(v_prefix, p_prefix, 'FZ');
  v_format := coalesce(v_format, '{prefix}-{yyyy}-{seq}');
  v_key := v_prefix || '-' || v_year;

  insert into public.order_code_counters (prefix_year, value)
  values (v_key, 1)
  on conflict (prefix_year) do update set value = order_code_counters.value + 1
  returning value into v_seq;

  return replace(replace(replace(v_format, '{prefix}', v_prefix), '{yyyy}', v_year),
                 '{seq}', lpad(v_seq::text, 6, '0'));
end;
$$;
grant execute on function public.next_order_code(text) to authenticated, service_role;

-- Fast approximate row count from planner stats (NEVER COUNT(*) on huge tables).
create or replace function public.estimated_count(p_table text)
returns bigint language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  n bigint;
begin
  select reltuples::bigint into n
  from pg_class
  where oid = format('public.%I', p_table)::regclass;
  return greatest(coalesce(n, 0), 0);
end;
$$;
grant execute on function public.estimated_count(text) to authenticated, service_role;

-- Per-user unread notification count (bounded by the user's own rows — cheap).
create or replace function public.unread_notification_count()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int
  from public.notification_reads
  where user_id = auth.uid() and read_at is null;
$$;
grant execute on function public.unread_notification_count() to authenticated;

-- Mark all of the caller's notifications read in one statement.
create or replace function public.mark_all_notifications_read()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  update public.notification_reads
    set read_at = now()
  where user_id = auth.uid() and read_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function public.mark_all_notifications_read() to authenticated;
