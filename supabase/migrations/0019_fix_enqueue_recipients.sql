-- Fix: enqueue_campaign_recipients (0010) used max(uuid), but Postgres has no
-- max() aggregate for uuid — every enqueue failed with "function max(uuid)
-- does not exist". Track the keyset cursor via an ordered subselect instead.

create or replace function public.enqueue_campaign_recipients(
  p_campaign_id uuid,
  p_batch integer default 1000
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  c record;
  f jsonb;
  v_count integer;
  v_last uuid;
begin
  select * into c from public.marketing_campaigns where id = p_campaign_id for update;
  if c.id is null then raise exception 'Campaign % not found', p_campaign_id; end if;

  -- Resolve the effective filter JSON.
  f := case c.audience_type
    when 'segment' then coalesce(
      (select s.filter from public.customer_segments s
        where s.id = (c.audience_value ->> 'segment_id')::uuid), '{}'::jsonb)
    when 'custom' then c.audience_value
    when 'tier'   then jsonb_build_object('tier_keys', c.audience_value -> 'tier_keys')
    else '{}'::jsonb
  end;

  with batch as (
    select cu.id, cu.name, cu.email, cu.phone, t.name as tier_name
    from public.customers cu
    left join public.customer_tiers t on t.id = cu.current_tier_id
    where cu.deleted_at is null
      and (c.enqueue_cursor is null or cu.id > c.enqueue_cursor)
      and (f -> 'tier_keys' is null
           or cu.current_tier_id in (select id from public.customer_tiers
                                     where key in (select jsonb_array_elements_text(f -> 'tier_keys'))))
      and (f ->> 'spend_min_cents' is null or cu.lifetime_spend_cents >= (f ->> 'spend_min_cents')::bigint)
      and (f ->> 'spend_max_cents' is null or cu.lifetime_spend_cents <= (f ->> 'spend_max_cents')::bigint)
      and (f ->> 'order_count_min' is null or cu.order_count >= (f ->> 'order_count_min')::int)
      and (f ->> 'last_purchase_after'  is null or cu.last_purchase_date >= (f ->> 'last_purchase_after')::date)
      and (f ->> 'last_purchase_before' is null or cu.last_purchase_date <= (f ->> 'last_purchase_before')::date)
      and (f -> 'regions' is null
           or cu.region in (select jsonb_array_elements_text(f -> 'regions')))
      and (f ->> 'product_id' is null
           or exists (select 1 from public.orders o
                      join public.order_items oi on oi.order_id = o.id
                      where o.customer_id = cu.id
                        and oi.product_id = (f ->> 'product_id')::uuid))
    order by cu.id
    limit p_batch
  ),
  ins as (
    insert into public.campaign_recipients (campaign_id, customer_id, merge_data)
    select c.id, b.id,
           jsonb_build_object('name', b.name, 'email', b.email, 'phone', b.phone,
                              'tier', coalesce(b.tier_name, 'Bronze'))
    from batch b
    on conflict (campaign_id, customer_id) do nothing
    returning customer_id
  )
  -- uuid has no max(); take the keyset cursor from an ordered subselect.
  select count(*),
         (select x.id from batch x order by x.id desc limit 1)
    into v_count, v_last
  from batch b;

  if v_last is not null then
    update public.marketing_campaigns
      set enqueue_cursor = v_last,
          total_recipients = (select count(*) from public.campaign_recipients
                              where campaign_id = p_campaign_id)
      where id = p_campaign_id;
  end if;

  return coalesce(v_count, 0);
end;
$$;
grant execute on function public.enqueue_campaign_recipients(uuid, integer) to authenticated, service_role;
