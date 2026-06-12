-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Customer Feedback analytics (spec v6 Module 8) — materialized views        ║
-- ║  refreshed by the existing 5-minute pg_cron job, NEVER live scans, plus     ║
-- ║  the "negative feedback resolved → apology voucher" automation event and    ║
-- ║  a dedupe of the doubled automation-rule seeds (two identical enabled       ║
-- ║  birthday/inactivity rules would each issue their own voucher).             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 1. Daily cube: rating × category × severity × channel per day ─────────────
-- Small cardinality (≤ days × cats × 3 sev × channels × 5 ratings) — feeds the
-- rating distribution, volume-by-category, channel and avg-over-time charts.
create materialized view public.mv_feedback_daily as
select
  f.created_at::date           as day,
  f.category,
  f.severity,
  f.source_channel,
  f.rating,
  count(*)::bigint             as feedback_count,
  count(*) filter (where f.status = 'resolved')::bigint as resolved_count
from public.customer_feedback f
where f.deleted_at is null
group by 1, 2, 3, 4, 5;

create unique index uq_mv_feedback_daily
  on public.mv_feedback_daily (day, category, severity, source_channel, rating);

-- ── 2. One-row summary (KPI cards + NPS buckets) ──────────────────────────────
create materialized view public.mv_feedback_summary as
select
  1 as id,
  count(*)::bigint                                       as total_feedback,
  round(avg(f.rating), 2)                                as avg_rating,
  round(avg(f.rating) filter (where f.created_at >= date_trunc('month', now())), 2)
                                                         as avg_rating_this_month,
  round(avg(f.rating) filter (where f.created_at >= date_trunc('month', now()) - interval '1 month'
                                and f.created_at <  date_trunc('month', now())), 2)
                                                         as avg_rating_last_month,
  count(*) filter (where f.status in ('new', 'reopened'))::bigint        as open_new,
  count(*) filter (where f.status = 'in_progress')::bigint               as open_in_progress,
  count(*) filter (where f.status in ('new', 'in_progress', 'reopened')
                     and f.severity = 'high')::bigint                    as open_high,
  count(*) filter (where f.status in ('new', 'in_progress', 'reopened')
                     and f.severity = 'medium')::bigint                  as open_medium,
  count(*) filter (where f.status in ('new', 'in_progress', 'reopened')
                     and f.severity = 'low')::bigint                     as open_low,
  count(*) filter (where f.status = 'resolved')::bigint                  as resolved_count,
  round(avg(extract(epoch from (f.resolved_at - f.created_at)) / 3600.0)
          filter (where f.resolved_at is not null), 1)                   as avg_resolution_hours,
  count(*) filter (where f.rating >= 4)::bigint                          as promoters,
  count(*) filter (where f.rating = 3)::bigint                           as passives,
  count(*) filter (where f.rating <= 2)::bigint                          as detractors,
  now() as refreshed_at
from public.customer_feedback f
where f.deleted_at is null;

create unique index uq_mv_feedback_summary on public.mv_feedback_summary (id);

-- ── 3. Products ranked by negative (1–2★) feedback ────────────────────────────
create materialized view public.mv_feedback_products as
select
  oi.product_id,
  p.name as product_name,
  p.sku,
  count(distinct f.id)::bigint as negative_count,
  round(avg(f.rating), 2)      as avg_rating
from public.customer_feedback f
join public.order_items oi on oi.order_id = f.order_id and oi.product_id is not null
join public.products p     on p.id = oi.product_id
where f.deleted_at is null and f.rating <= 2
group by oi.product_id, p.name, p.sku
order by negative_count desc
limit 50;

create unique index uq_mv_feedback_products on public.mv_feedback_products (product_id);

-- ── 4. Staff resolver leaderboard ─────────────────────────────────────────────
create materialized view public.mv_feedback_staff as
select
  f.resolved_by,
  u.full_name,
  count(*)::bigint as resolved_count,
  round((percentile_cont(0.5) within group
    (order by extract(epoch from (f.resolved_at - f.created_at)) / 3600.0))::numeric, 1)
    as median_resolution_hours
from public.customer_feedback f
join public.users u on u.id = f.resolved_by
where f.deleted_at is null and f.resolved_by is not null and f.resolved_at is not null
group by f.resolved_by, u.full_name
order by resolved_count desc
limit 50;

create unique index uq_mv_feedback_staff on public.mv_feedback_staff (resolved_by);

-- ── 5. Customers with repeated negative feedback (CRM follow-up flags) ────────
create materialized view public.mv_feedback_repeat_negative as
select
  f.customer_id,
  c.name,
  count(*)::bigint        as negative_count,
  max(f.created_at)       as last_negative_at
from public.customer_feedback f
join public.customers c on c.id = f.customer_id
where f.deleted_at is null and f.rating <= 2 and f.customer_id is not null
group by f.customer_id, c.name
having count(*) >= 2
order by negative_count desc
limit 100;

create unique index uq_mv_feedback_repeat on public.mv_feedback_repeat_negative (customer_id);

-- MV access pattern matches the other analytics views: no API-role grants —
-- served via the service role behind feedback.analytics_view.
revoke all on public.mv_feedback_daily, public.mv_feedback_summary,
  public.mv_feedback_products, public.mv_feedback_staff,
  public.mv_feedback_repeat_negative from anon, authenticated;

-- ── 6. Fold into the existing 5-minute refresh ────────────────────────────────
create or replace function public.refresh_analytics_views()
returns void language plpgsql security definer set search_path = public as $$
begin
  refresh materialized view concurrently public.mv_product_profitability;
  refresh materialized view concurrently public.mv_revenue_daily;
  refresh materialized view concurrently public.mv_printer_stats;
  refresh materialized view concurrently public.mv_material_stats;
  refresh materialized view concurrently public.mv_inventory_value;
  refresh materialized view concurrently public.mv_orders_daily;
  refresh materialized view concurrently public.mv_printer_daily;
  refresh materialized view concurrently public.mv_top_customers;
  refresh materialized view concurrently public.mv_summary_stats;
  refresh materialized view concurrently public.mv_feedback_daily;
  refresh materialized view concurrently public.mv_feedback_summary;
  refresh materialized view concurrently public.mv_feedback_products;
  refresh materialized view concurrently public.mv_feedback_staff;
  refresh materialized view concurrently public.mv_feedback_repeat_negative;
end;
$$;

-- ── 7. Apology-voucher automation event ───────────────────────────────────────
alter table public.automation_rules drop constraint if exists automation_rules_event_type_check;
alter table public.automation_rules add constraint automation_rules_event_type_check
  check (event_type in ('tier_reached', 'inactivity', 'birthday', 'spend_threshold',
                        'negative_feedback_resolved'));

-- Dedupe the doubled seeds FIRST (0018 + a re-run left two enabled copies of
-- the birthday/inactivity rules — each would issue its own voucher since the
-- execution dedupe key includes the rule id). Keep the earliest of each name.
delete from public.automation_rules a
using public.automation_rules b
where a.name = b.name and a.event_type = b.event_type and a.id > b.id;

insert into public.automation_rules (name, event_type, condition, action_type, action_config, is_enabled)
select
  'Apology voucher on resolved negative feedback',
  'negative_feedback_resolved',
  '{"max_rating": 2}'::jsonb,
  'issue_voucher',
  '{"type": "fixed", "value_cents": 5000000, "valid_days": 30, "prefix": "SORRY"}'::jsonb,
  true
where not exists (
  select 1 from public.automation_rules where event_type = 'negative_feedback_resolved'
);
