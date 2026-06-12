-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Messages (Phase 8): conversation overview RPC.                            ║
-- ║  One call returns the caller's conversations with the latest message and   ║
-- ║  an unread count — a lateral top-1 per group riding                        ║
-- ║  idx_messages_group_created instead of N+1 queries from the app.           ║
-- ║  SECURITY DEFINER but hard-scoped to auth.uid()'s own memberships.         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create or replace function public.my_conversations()
returns table (
  group_id uuid,
  name text,
  type text,
  created_at timestamptz,
  last_read_at timestamptz,
  other_user_id uuid,
  other_name text,
  other_avatar_url text,
  member_count bigint,
  last_body text,
  last_at timestamptz,
  last_sender_name text,
  last_deleted boolean,
  unread_count bigint
) language sql stable security definer set search_path = public as $$
  select
    g.id,
    g.name,
    g.type,
    g.created_at,
    gm.last_read_at,
    other.user_id,
    other.full_name,
    other.avatar_url,
    (select count(*) from public.group_members c where c.group_id = g.id),
    lm.body,
    lm.created_at,
    lm.sender_name,
    lm.deleted,
    (
      select count(*)
      from public.messages m
      where m.group_id = g.id
        and m.created_at > coalesce(gm.last_read_at, 'epoch'::timestamptz)
        and (m.sender_id is distinct from auth.uid())
    )
  from public.group_members gm
  join public.message_groups g on g.id = gm.group_id and g.is_active
  left join lateral (
    select gm2.user_id, u.full_name, u.avatar_url
    from public.group_members gm2
    join public.users u on u.id = gm2.user_id
    where gm2.group_id = g.id and gm2.user_id <> auth.uid()
    limit 1
  ) other on g.type = 'direct'
  left join lateral (
    select m.body, m.created_at, m.deleted, u.full_name as sender_name
    from public.messages m
    left join public.users u on u.id = m.sender_id
    where m.group_id = g.id
    order by m.created_at desc
    limit 1
  ) lm on true
  where gm.user_id = auth.uid()
  order by coalesce(lm.created_at, g.created_at) desc;
$$;

grant execute on function public.my_conversations() to authenticated;
