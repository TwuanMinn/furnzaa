-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0027 — RPC grant hardening + in-function permission guards (final QA).    ║
-- ║                                                                            ║
-- ║ Finding: SECURITY DEFINER RPCs carried the default PUBLIC execute grant,  ║
-- ║ so the browser-shipped anon key could invoke stock/CRM/voucher mutators   ║
-- ║ via PostgREST /rest/v1/rpc/*, and any signed-in user could invoke the     ║
-- ║ cron/service-only claim functions. requirePermission in server actions    ║
-- ║ is one enforcement layer — this restores the DB as the second.            ║
-- ║                                                                            ║
-- ║  A) revoke EXECUTE from public + anon on every app RPC (no RPC is         ║
-- ║     anon-reachable by design; /api/track uses plain table writes),        ║
-- ║  B) cron/service-only RPCs: revoke from authenticated too,                ║
-- ║  C) stock/CRM/voucher mutators re-check the caller's permission inside    ║
-- ║     the function. Service role passes (auth.uid() is null); nested        ║
-- ║     definer calls still see the real caller's JWT, so the chains          ║
-- ║     PO-receive → movement etc. stay permission-consistent.                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── C0: shared guard ──────────────────────────────────────────────────────────
create or replace function public.assert_any_permission(variadic p_keys text[])
returns void
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    return;  -- service role / cron / owner-context definer chains
  end if;
  if exists (
    select 1
    from public.users u
    join public.role_permissions rp on rp.role_id = u.role_id
    join public.permissions p on p.id = rp.permission_id
    where u.id = auth.uid() and p.key = any (p_keys)
  ) then
    return;
  end if;
  raise exception 'Permission denied (need one of: %)', array_to_string(p_keys, ', ')
    using errcode = '42501';
end;
$$;
revoke execute on function public.assert_any_permission(text[]) from public, anon;

-- ── C1: apply_inventory_movement — every legitimate entry path's permission ──
create or replace function public.apply_inventory_movement(p_product_id uuid, p_movement_type text, p_quantity integer, p_variant_id uuid DEFAULT NULL::uuid, p_warehouse_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_reference_type text DEFAULT NULL::text, p_reference_id uuid DEFAULT NULL::uuid, p_allow_negative boolean DEFAULT false)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_prev integer;
  v_new  integer;
  v_id   uuid;
  v_wh   uuid;
begin
  perform public.assert_any_permission(
    'inventory.adjust', 'purchase_orders.receive', 'production.manage',
    'orders.update_status', 'orders.edit');

  if p_quantity = 0 then
    raise exception 'Movement quantity cannot be zero';
  end if;
  if p_movement_type not in ('purchase','sale','production','adjustment','transfer','return') then
    raise exception 'Invalid movement type %', p_movement_type;
  end if;

  -- Serialize concurrent stock changes per product.
  select current_stock into v_prev from public.products where id = p_product_id for update;
  if v_prev is null then
    raise exception 'Product % not found', p_product_id;
  end if;

  v_new := v_prev + p_quantity;
  if v_new < 0 and not p_allow_negative then
    raise exception 'Insufficient stock: have %, change %', v_prev, p_quantity;
  end if;

  -- Default warehouse when none specified.
  v_wh := p_warehouse_id;
  if v_wh is null then
    select id into v_wh from public.warehouses where is_default and deleted_at is null limit 1;
  end if;

  insert into public.inventory_movements
    (product_id, variant_id, warehouse_id, movement_type, quantity,
     previous_stock, new_stock, notes, reference_type, reference_id, created_by)
  values
    (p_product_id, p_variant_id, v_wh, p_movement_type, p_quantity,
     v_prev, v_new, p_notes, p_reference_type, p_reference_id, auth.uid())
  returning id into v_id;

  update public.products set current_stock = v_new, updated_by = auth.uid() where id = p_product_id;

  if p_variant_id is not null then
    update public.product_variants
      set current_stock = current_stock + p_quantity
      where id = p_variant_id;
  end if;

  if v_wh is not null then
    insert into public.warehouse_inventory (warehouse_id, product_id, variant_id, quantity)
    values (v_wh, p_product_id, p_variant_id, p_quantity)
    on conflict (warehouse_id, product_id, variant_id)
    do update set quantity = public.warehouse_inventory.quantity + excluded.quantity;
  end if;

  return v_id;
end;
$function$;

-- ── C2: apply_order_stock_movements ──────────────────────────────────────────
create or replace function public.apply_order_stock_movements(p_order_id uuid, p_direction text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  o record;
  r record;
  v_count integer := 0;
begin
  perform public.assert_any_permission('orders.update_status', 'orders.edit');

  if p_direction not in ('sale','return') then
    raise exception 'Direction must be sale or return';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    raise exception 'Order % not found', p_order_id;
  end if;

  if p_direction = 'sale' then
    if o.sale_movements_at is not null then return 0; end if;   -- already applied
  else
    if o.return_movements_at is not null then return 0; end if;
    if o.sale_movements_at is null then return 0; end if;        -- nothing to restore
  end if;

  for r in
    select product_id, variant_id, quantity from public.order_items
    where order_id = p_order_id and product_id is not null and quantity > 0
  loop
    perform public.apply_inventory_movement(
      r.product_id,
      case p_direction when 'sale' then 'sale' else 'return' end,
      case p_direction when 'sale' then -r.quantity else r.quantity end,
      r.variant_id, null,
      case p_direction when 'sale' then 'Order shipped' else 'Order returned' end,
      'order', p_order_id,
      true);  -- allow negative: shipping must not be blocked by drifted stock
    v_count := v_count + 1;
  end loop;

  if p_direction = 'sale' then
    update public.orders set sale_movements_at = now() where id = p_order_id;
  else
    update public.orders set return_movements_at = now() where id = p_order_id;
  end if;

  return v_count;
end;
$function$;

-- ── C3: apply_order_to_crm ────────────────────────────────────────────────────
create or replace function public.apply_order_to_crm(p_order_id uuid)
 returns table(applied boolean, customer_id uuid, tier_changed boolean, previous_tier_id uuid, new_tier_id uuid)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  o record;
  t record;
  v_rules jsonb;
  v_pts_order numeric;
  v_pts_per_100 numeric;
begin
  perform public.assert_any_permission('orders.update_status', 'orders.edit');

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
$function$;

-- ── C4: redeem_voucher ────────────────────────────────────────────────────────
create or replace function public.redeem_voucher(p_code text, p_customer_id uuid, p_order_id uuid, p_order_total_cents bigint)
 returns table(redemption_id uuid, discount_cents bigint, voucher_id uuid)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v record;
  v_discount bigint;
  v_rid uuid;
begin
  perform public.assert_any_permission('orders.create', 'orders.edit');

  select * into v from public.vouchers where code = p_code for update;
  if v.id is null then raise exception 'Invalid voucher code'; end if;
  if not v.is_active then raise exception 'Voucher is inactive'; end if;
  if v.start_date > current_date then raise exception 'Voucher not yet valid'; end if;
  if v.end_date is not null and v.end_date < current_date then raise exception 'Voucher expired'; end if;
  if v.usage_limit is not null and v.used_count >= v.usage_limit then
    raise exception 'Voucher usage limit reached';
  end if;
  if v.assigned_customer_id is not null and v.assigned_customer_id <> p_customer_id then
    raise exception 'Voucher is assigned to another customer';
  end if;

  v_discount := case v.type
    when 'percentage'    then (p_order_total_cents * v.value_percent / 100.0)::bigint
    when 'fixed'         then least(v.value_cents, p_order_total_cents)
    when 'free_shipping' then 0
  end;

  insert into public.voucher_redemptions (voucher_id, customer_id, order_id, amount_discounted_cents)
  values (v.id, p_customer_id, p_order_id, v_discount)
  returning id into v_rid;

  update public.vouchers set used_count = used_count + 1 where id = v.id;

  return query select v_rid, v_discount, v.id;
end;
$function$;

-- ── C5: receive_purchase_order ────────────────────────────────────────────────
create or replace function public.receive_purchase_order(p_po_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_status text;
  v_count  integer := 0;
  r record;
begin
  perform public.assert_any_permission('purchase_orders.receive');

  select status into v_status from public.purchase_orders where id = p_po_id for update;
  if v_status is null then
    raise exception 'Purchase order % not found', p_po_id;
  end if;
  if v_status = 'received' then
    raise exception 'Purchase order already received';
  end if;
  if v_status = 'cancelled' then
    raise exception 'Cannot receive a cancelled purchase order';
  end if;

  for r in
    select product_id, variant_id, quantity from public.purchase_order_items
    where purchase_order_id = p_po_id
  loop
    perform public.apply_inventory_movement(
      r.product_id, 'purchase', r.quantity, r.variant_id, null,
      'PO received', 'purchase_order', p_po_id);
    v_count := v_count + 1;
  end loop;

  update public.purchase_orders
    set status = 'received', received_by = auth.uid(), received_at = now()
    where id = p_po_id;

  return v_count;
end;
$function$;

-- ── C6: complete_production_order ─────────────────────────────────────────────
create or replace function public.complete_production_order(p_id uuid)
 returns bigint
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_po record;
  v_material_cents bigint := 0;
  v_total bigint;
  r record;
begin
  perform public.assert_any_permission('production.manage');

  select * into v_po from public.production_orders where id = p_id for update;
  if v_po.id is null then
    raise exception 'Production order % not found', p_id;
  end if;
  if v_po.status = 'completed' then
    raise exception 'Production order already completed';
  end if;
  if v_po.status = 'cancelled' then
    raise exception 'Cannot complete a cancelled production order';
  end if;

  -- Consume components per BOM.
  for r in
    select b.component_product_id,
           ceil(b.quantity_per_unit * v_po.quantity)::integer as needed,
           p.cost_price_cents
    from public.bill_of_materials b
    join public.products p on p.id = b.component_product_id
    where b.finished_product_id = v_po.product_id
  loop
    perform public.apply_inventory_movement(
      r.component_product_id, 'production', -r.needed, null, null,
      'Consumed by production ' || v_po.code, 'production_order', p_id);
    v_material_cents := v_material_cents + (r.cost_price_cents * r.needed);
  end loop;

  -- Produce finished goods.
  perform public.apply_inventory_movement(
    v_po.product_id, 'production', v_po.quantity, null, null,
    'Produced by ' || v_po.code, 'production_order', p_id);

  v_total := v_material_cents + v_po.labor_cost_cents + v_po.packaging_cost_cents + v_po.overhead_cost_cents;

  update public.production_orders
    set status = 'completed',
        material_cost_cents = v_material_cents,
        total_cost_cents = v_total,
        completed_at = now(),
        completed_by = auth.uid()
    where id = p_id;

  return v_total;
end;
$function$;

-- ── A: no RPC is anon-reachable ───────────────────────────────────────────────
revoke execute on function public.apply_inventory_movement(uuid, text, integer, uuid, uuid, text, text, uuid, boolean) from public, anon;
revoke execute on function public.apply_order_stock_movements(uuid, text) from public, anon;
revoke execute on function public.apply_order_to_crm(uuid) from public, anon;
revoke execute on function public.cast_poll_vote(uuid, uuid[]) from public, anon;
revoke execute on function public.complete_production_order(uuid) from public, anon;
revoke execute on function public.has_permission(text) from public, anon;
revoke execute on function public.is_group_member(uuid) from public, anon;
revoke execute on function public.mark_all_notifications_read() from public, anon;
revoke execute on function public.my_conversations() from public, anon;
revoke execute on function public.next_document_number(text) from public, anon;
revoke execute on function public.next_order_code(text) from public, anon;
revoke execute on function public.poll_results(uuid) from public, anon;
revoke execute on function public.receive_purchase_order(uuid) from public, anon;
revoke execute on function public.redeem_voucher(text, uuid, uuid, bigint) from public, anon;
revoke execute on function public.unread_notification_count() from public, anon;
-- trigger functions cannot be RPC'd, revoked for completeness
revoke execute on function public.bump_user_activity_daily() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_activity_log_hash() from public, anon, authenticated;

-- ── B: cron/service-only — service role exclusively ──────────────────────────
revoke execute on function public.best_tier_for(bigint, bigint, integer, numeric) from public, anon, authenticated;
revoke execute on function public.claim_due_print_notifications(integer) from public, anon, authenticated;
revoke execute on function public.claim_due_scheduled_items(integer) from public, anon, authenticated;
revoke execute on function public.claim_invite_link(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.enqueue_campaign_recipients(uuid, integer) from public, anon, authenticated;
revoke execute on function public.ensure_activity_log_partitions(integer, integer) from public, anon, authenticated;
revoke execute on function public.ensure_campaign_event_partitions(integer, integer) from public, anon, authenticated;
revoke execute on function public.estimated_count(text) from public, anon, authenticated;
revoke execute on function public.evaluate_customer_tier(uuid) from public, anon, authenticated;
revoke execute on function public.reconcile_customer_aggregates(integer) from public, anon, authenticated;
revoke execute on function public.reconcile_user_activity(integer) from public, anon, authenticated;
revoke execute on function public.refresh_campaign_stats(uuid) from public, anon, authenticated;
revoke execute on function public.verify_activity_log_chain(integer) from public, anon, authenticated;
