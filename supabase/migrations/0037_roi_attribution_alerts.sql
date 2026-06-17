-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ROI v1.1 — order auto-attribution + break-even/underperforming alerts.    ║
-- ║                                                                            ║
-- ║  • Notification stamps (break_even_notified_at / underperforming_…) so the ║
-- ║    cron alerts fire ONCE per state entry; the cron re-arms them when the   ║
-- ║    status changes back.                                                    ║
-- ║  • attribution_product_ids: an investment can be linked to a product set;  ║
-- ║    delivered+paid order revenue for those products is rolled in as a       ║
-- ║    Revenue cash-flow (source='order'), idempotent per (investment, order). ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

alter table public.investments
  add column if not exists break_even_notified_at      timestamptz,
  add column if not exists underperforming_notified_at timestamptz,
  add column if not exists attribution_product_ids      uuid[];

-- attribution_product_ids is human-editable (set in the investment dialog); the
-- notification stamps are cron-only (service role bypasses column grants).
grant insert (attribution_product_ids) on public.investments to authenticated;
grant update (attribution_product_ids) on public.investments to authenticated;

-- One active order-attribution per (investment, order) — defeats double-count.
create unique index uq_inv_cf_order_attr
  on public.investment_cash_flows (investment_id, reference_id)
  where source = 'order' and reference_id is not null and deleted_at is null;

-- ── Auto-attribution engine (service-role, cron-invoked) ──────────────────────
-- For every active investment with a linked product set, attribute each
-- delivered+paid order's revenue for those products (qty × selling price) once.
create or replace function public.run_roi_auto_attribution(p_limit integer default 500)
returns integer
language plpgsql security definer set search_path to 'public' as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    select
      i.id                                                   as investment_id,
      o.id                                                   as order_id,
      o.buying_date                                          as entry_date,
      sum(oi.quantity * p.selling_price_cents)::bigint       as revenue_cents
    from public.investments i
    join public.orders o
      on o.status = 'delivered' and o.payment_status = 'paid' and o.is_active
    join public.order_items oi
      on oi.order_id = o.id and oi.product_id = any (i.attribution_product_ids)
    join public.products p on p.id = oi.product_id
    where i.deleted_at is null and i.is_active
      and i.attribution_product_ids is not null
      and array_length(i.attribution_product_ids, 1) > 0
      and not exists (
        select 1 from public.investment_cash_flows cf
        where cf.investment_id = i.id and cf.reference_id = o.id
          and cf.source = 'order' and cf.deleted_at is null
      )
    group by i.id, o.id, o.buying_date
    limit p_limit
  loop
    if r.revenue_cents > 0 then
      perform public.apply_investment_cash_flow(
        r.investment_id, 'revenue', r.revenue_cents, r.entry_date,
        'Auto-attributed from order', 'order', 'order', r.order_id);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
grant execute on function public.run_roi_auto_attribution(integer) to service_role;
revoke execute on function public.run_roi_auto_attribution(integer) from public, anon, authenticated;

notify pgrst, 'reload schema';
