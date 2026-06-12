-- 0022: fix claim_invite_link — "column reference \"group_id\" is ambiguous".
-- The RETURNS TABLE clause declares an OUT variable named group_id, and
-- PL/pgSQL parses the ON CONFLICT target (group_id, user_id) as expressions,
-- so the bare column name collided with the OUT variable and every join via
-- invite link failed at runtime. #variable_conflict use_column restores the
-- intended resolution; all variable reads are already l./p_/v_ qualified.

create or replace function public.claim_invite_link(p_link_id uuid, p_user_id uuid)
returns table (joined boolean, group_id uuid, reason text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  l record;
  v_active boolean;
begin
  select * into l from public.group_invite_links where id = p_link_id for update;
  if l.id is null then
    return query select false, null::uuid, 'Link not found'; return;
  end if;
  if l.revoked_at is not null then
    return query select false, l.group_id, 'Link revoked'; return;
  end if;
  if l.expires_at is not null and l.expires_at < now() then
    return query select false, l.group_id, 'Link expired'; return;
  end if;
  if l.max_uses is not null and l.use_count >= l.max_uses then
    return query select false, l.group_id, 'Link usage limit reached'; return;
  end if;

  -- INTERNAL ONLY: the target must be an existing, ACTIVE user of the app.
  select is_active into v_active from public.users where id = p_user_id;
  if v_active is distinct from true then
    return query select false, l.group_id, 'User is not an active member of this workspace'; return;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (l.group_id, p_user_id, 'member')
  on conflict (group_id, user_id) do nothing;

  update public.group_invite_links
    set use_count = use_count + 1,
        revoked_at = case when link_type = 'one_time' then now() else revoked_at end
    where id = p_link_id;

  return query select true, l.group_id, null::text;
end;
$$;
