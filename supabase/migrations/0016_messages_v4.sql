-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Messages v4 (spec v4, Module 8).                                          ║
-- ║   • groups: description; replies (reply_to) + forwarding (label survives    ║
-- ║     original deletion via the `forwarded` flag).                            ║
-- ║   • message_reactions — one row per user+emoji (a user may leave MULTIPLE   ║
-- ║     different emojis); live via Realtime.                                   ║
-- ║   • message_pins (group-wide bar) vs pinned_conversations (personal) vs     ║
-- ║     message_stars (personal favorites) — three distinct features.           ║
-- ║   • group_invite_links — INTERNAL ONLY; tokens stored HASHED; one-time      ║
-- ║     consumption is atomic (claim RPC with row lock).                        ║
-- ║   • scheduled_items — ONE unified scheduler for delayed messages,           ║
-- ║     reminders and scheduled polls; claim RPC (SKIP LOCKED + stamp) makes    ║
-- ║     the cron runner idempotent. Marketing automation reuses this runner.    ║
-- ║   • polls — single/multi choice, public/anonymous. Voter identity is        ║
-- ║     stored (one vote set per user) but for anonymous polls RLS hides vote   ║
-- ║     rows from EVERYONE except the voter (admins included); aggregate        ║
-- ║     counts come from a SECURITY DEFINER results RPC.                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Groups & messages: new columns ───────────────────────────────────────────
alter table public.message_groups add column description text;

alter table public.messages
  add column reply_to_message_id uuid references public.messages (id) on delete set null,
  add column forwarded boolean not null default false,
  add column forwarded_from_message_id uuid references public.messages (id) on delete set null;

create index idx_messages_reply_to on public.messages (reply_to_message_id);

-- ── Reactions ────────────────────────────────────────────────────────────────
create table public.message_reactions (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);
create index idx_reactions_message on public.message_reactions (message_id);

-- ── Pins (group-wide) / pinned conversations (personal) / stars (personal) ──
create table public.message_pins (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.message_groups (id) on delete cascade,
  message_id uuid not null unique references public.messages (id) on delete cascade,
  pinned_by  uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_message_pins_group on public.message_pins (group_id, created_at desc);

create table public.pinned_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  group_id   uuid not null references public.message_groups (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, group_id)
);
create index idx_pinned_conversations_user on public.pinned_conversations (user_id);

create table public.message_stars (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, message_id)
);
create index idx_message_stars_user on public.message_stars (user_id, created_at desc);

-- ── Internal-only group invite links (tokens HASHED, revocable) ─────────────
create table public.group_invite_links (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.message_groups (id) on delete cascade,
  created_by    uuid references public.users (id) on delete set null,
  link_type     text not null check (link_type in ('one_time','expiring','permanent','password')),
  token_hash    text not null unique,       -- sha-256 of the URL token; raw token never stored
  password_hash text,                       -- bcrypt, only for link_type = 'password'
  expires_at    timestamptz,                -- only for link_type = 'expiring'
  max_uses      integer,                    -- optional cap (settings default)
  use_count     integer not null default 0,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index idx_invite_links_group on public.group_invite_links (group_id);

-- Atomic join-via-link. The app layer (service role) already verified the
-- password for password links; this RPC does every other check under a row
-- lock so a one-time link can never admit two users.
create or replace function public.claim_invite_link(p_link_id uuid, p_user_id uuid)
returns table (joined boolean, group_id uuid, reason text)
language plpgsql security definer set search_path = public as $$
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
grant execute on function public.claim_invite_link(uuid, uuid) to service_role;

-- ── Unified scheduler (messages + reminders + scheduled polls) ──────────────
create table public.scheduled_items (
  id                      uuid primary key default gen_random_uuid(),
  group_id                uuid not null references public.message_groups (id) on delete cascade,
  created_by              uuid references public.users (id) on delete set null,
  kind                    text not null check (kind in ('message','reminder','poll')),
  body                    text not null default '',
  audience                text not null default 'group' check (audience in ('group','only_me')),
  priority                text not null default 'normal' check (priority in ('low','normal','high')),
  poll_id                 uuid,                -- kind = 'poll': publish this draft poll
  next_run_at             timestamptz not null,
  repeat_rule             text not null default 'none'
                          check (repeat_rule in ('none','daily','weekly','monthly','quarterly','yearly','custom')),
  repeat_interval_minutes integer,             -- only for repeat_rule = 'custom'
  last_run_at             timestamptz,
  runs_count              integer not null default 0,
  is_active               boolean not null default true,
  cancelled_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (repeat_rule <> 'custom' or coalesce(repeat_interval_minutes, 0) >= 5)
);
-- The cron runner's whole working set: active items that are due.
create index idx_scheduled_items_due on public.scheduled_items (next_run_at)
  where is_active;
create index idx_scheduled_items_group on public.scheduled_items (group_id);
create trigger trg_scheduled_items_updated before update on public.scheduled_items
  for each row execute function public.set_updated_at();

-- Idempotent claim: lock due rows (SKIP LOCKED), advance/retire their schedule
-- in the SAME statement, return what was claimed. A second runner tick can
-- never fire the same occurrence twice.
create or replace function public.claim_due_scheduled_items(p_limit integer default 50)
returns setof public.scheduled_items
language plpgsql security definer set search_path = public as $$
declare
  r public.scheduled_items;
begin
  for r in
    select * from public.scheduled_items
    where is_active and next_run_at <= now()
    order by next_run_at
    limit p_limit
    for update skip locked
  loop
    update public.scheduled_items s set
      last_run_at = now(),
      runs_count = s.runs_count + 1,
      next_run_at = case r.repeat_rule
        when 'none'      then s.next_run_at
        when 'daily'     then r.next_run_at + interval '1 day'
        when 'weekly'    then r.next_run_at + interval '7 days'
        when 'monthly'   then r.next_run_at + interval '1 month'
        when 'quarterly' then r.next_run_at + interval '3 months'
        when 'yearly'    then r.next_run_at + interval '1 year'
        when 'custom'    then r.next_run_at + make_interval(mins => coalesce(r.repeat_interval_minutes, 60))
      end,
      is_active = (r.repeat_rule <> 'none')
    where s.id = r.id;
    return next r;
  end loop;
end;
$$;
grant execute on function public.claim_due_scheduled_items(integer) to service_role;

-- ── Polls ────────────────────────────────────────────────────────────────────
create table public.polls (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.message_groups (id) on delete cascade,
  message_id uuid references public.messages (id) on delete set null,  -- chat anchor once published
  created_by uuid references public.users (id) on delete set null,
  question   text not null,
  poll_type  text not null default 'single' check (poll_type in ('single','multiple')),
  visibility text not null default 'public' check (visibility in ('public','anonymous')),
  status     text not null default 'open' check (status in ('draft','open','closed')),
  closes_at  timestamptz,
  closed_at  timestamptz,
  created_at timestamptz not null default now()
);
create index idx_polls_group on public.polls (group_id, created_at desc);
-- Auto-close scan for the runner:
create index idx_polls_open_closes on public.polls (closes_at) where status = 'open';

alter table public.scheduled_items
  add constraint scheduled_items_poll_fkey
  foreign key (poll_id) references public.polls (id) on delete cascade;

create table public.poll_options (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid not null references public.polls (id) on delete cascade,
  label      text not null,
  sort_order integer not null default 0
);
create index idx_poll_options_poll on public.poll_options (poll_id);

create table public.poll_votes (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid not null references public.polls (id) on delete cascade,
  option_id  uuid not null references public.poll_options (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (option_id, user_id)
);
create index idx_poll_votes_poll on public.poll_votes (poll_id);

-- Atomic vote (change-vote = replace the user's whole vote set). Enforces
-- open status, expiry, membership, and single-choice = exactly one option.
create or replace function public.cast_poll_vote(p_poll_id uuid, p_option_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  p record;
  v_valid integer;
begin
  select * into p from public.polls where id = p_poll_id for update;
  if p.id is null then raise exception 'Poll not found'; end if;
  if p.status <> 'open' then raise exception 'Poll is not open'; end if;
  if p.closes_at is not null and p.closes_at < now() then raise exception 'Poll has expired'; end if;
  if not public.is_group_member(p.group_id) and not public.is_admin() then
    raise exception 'Only group members can vote';
  end if;
  if p.poll_type = 'single' and array_length(p_option_ids, 1) <> 1 then
    raise exception 'Pick exactly one option';
  end if;
  if array_length(p_option_ids, 1) is null then
    raise exception 'Pick at least one option';
  end if;

  select count(*) into v_valid from public.poll_options
    where poll_id = p_poll_id and id = any (p_option_ids);
  if v_valid <> array_length(p_option_ids, 1) then
    raise exception 'Invalid option for this poll';
  end if;

  delete from public.poll_votes where poll_id = p_poll_id and user_id = auth.uid();
  insert into public.poll_votes (poll_id, option_id, user_id)
  select p_poll_id, unnest(p_option_ids), auth.uid();
end;
$$;
grant execute on function public.cast_poll_vote(uuid, uuid[]) to authenticated;

-- Aggregated results — totals for everyone; voter names ONLY for public polls.
-- This is the ONLY path that touches anonymous votes beyond the voter's own row.
create or replace function public.poll_results(p_poll_id uuid)
returns table (option_id uuid, votes bigint, voter_names text[])
language plpgsql stable security definer set search_path = public as $$
declare
  p record;
begin
  select * into p from public.polls where id = p_poll_id;
  if p.id is null then raise exception 'Poll not found'; end if;
  if not public.is_group_member(p.group_id) and not public.is_admin() then
    raise exception 'Only group members can view results';
  end if;

  return query
  select
    o.id,
    count(v.id)::bigint,
    case when p.visibility = 'public'
      then coalesce(array_agg(u.full_name order by v.created_at) filter (where v.id is not null), '{}')
      else '{}'::text[]   -- anonymous: identities NEVER leave the database
    end
  from public.poll_options o
  left join public.poll_votes v on v.option_id = o.id
  left join public.users u on u.id = v.user_id
  where o.poll_id = p_poll_id
  group by o.id, o.sort_order
  order by o.sort_order;
end;
$$;
grant execute on function public.poll_results(uuid) to authenticated;

-- ── Messaging configuration (Settings → Messaging) ──────────────────────────
alter table public.organization_settings
  add column messaging_config jsonb not null default '{
    "reaction_emojis": ["❤️","😆","😮","😢","👍","👎"],
    "invite_link_defaults": {"expiry_hours": 168, "max_uses": 25},
    "all_mention_policy": "creator_admin"
  }'::jsonb;

-- ════════════════════════ GRANTS + RLS ══════════════════════════════════════
grant select, insert, delete on public.message_reactions, public.message_pins,
  public.pinned_conversations, public.message_stars to authenticated;
grant select, insert, update on public.group_invite_links, public.scheduled_items,
  public.polls to authenticated;
grant select, insert, update, delete on public.poll_options to authenticated;
grant select on public.poll_votes to authenticated;

alter table public.message_reactions    enable row level security;
alter table public.message_pins         enable row level security;
alter table public.pinned_conversations enable row level security;
alter table public.message_stars        enable row level security;
alter table public.group_invite_links   enable row level security;
alter table public.scheduled_items      enable row level security;
alter table public.polls                enable row level security;
alter table public.poll_options         enable row level security;
alter table public.poll_votes           enable row level security;

-- Reactions: group members see + add; only the reactor removes their own.
create policy reactions_select on public.message_reactions for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id
    and (public.is_admin() or public.is_group_member(m.group_id))));
create policy reactions_insert on public.message_reactions for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.messages m
    where m.id = message_id and (public.is_admin() or public.is_group_member(m.group_id))));
create policy reactions_delete on public.message_reactions for delete to authenticated
  using (user_id = auth.uid());

-- Group-wide pins: any member may pin/unpin (spec), members read.
create policy pins_select on public.message_pins for select to authenticated
  using (public.is_admin() or public.is_group_member(group_id));
create policy pins_insert on public.message_pins for insert to authenticated
  with check (pinned_by = auth.uid() and (public.is_admin() or public.is_group_member(group_id)));
create policy pins_delete on public.message_pins for delete to authenticated
  using (public.is_admin() or public.is_group_member(group_id));

-- Personal pins + stars: strictly own rows.
create policy pinned_conv_own on public.pinned_conversations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy stars_own on public.message_stars for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Invite links: creator/admin manage; reads limited the same way (tokens are
-- hashed, but only managers have any business listing them).
create policy invite_links_select on public.group_invite_links for select to authenticated
  using (public.is_admin() or created_by = auth.uid());
create policy invite_links_insert on public.group_invite_links for insert to authenticated
  with check (created_by = auth.uid()
    and exists (select 1 from public.message_groups g where g.id = group_id
      and (public.is_admin() or g.created_by = auth.uid())));
create policy invite_links_update on public.group_invite_links for update to authenticated
  using (public.is_admin() or created_by = auth.uid())
  with check (public.is_admin() or created_by = auth.uid());

-- Scheduler: members create their own items in their groups; creator/admin manage.
create policy scheduled_select on public.scheduled_items for select to authenticated
  using (created_by = auth.uid() or public.is_admin()
    or (audience = 'group' and public.is_group_member(group_id)));
create policy scheduled_insert on public.scheduled_items for insert to authenticated
  with check (created_by = auth.uid() and (public.is_admin() or public.is_group_member(group_id)));
create policy scheduled_update on public.scheduled_items for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

-- Polls: members read; members create; creator/admin update (close/publish).
create policy polls_select on public.polls for select to authenticated
  using (public.is_admin() or public.is_group_member(group_id));
create policy polls_insert on public.polls for insert to authenticated
  with check (created_by = auth.uid() and (public.is_admin() or public.is_group_member(group_id)));
create policy polls_update on public.polls for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

create policy poll_options_select on public.poll_options for select to authenticated
  using (exists (select 1 from public.polls p where p.id = poll_id
    and (public.is_admin() or public.is_group_member(p.group_id))));
create policy poll_options_write on public.poll_options for all to authenticated
  using (exists (select 1 from public.polls p where p.id = poll_id
    and (p.created_by = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.polls p where p.id = poll_id
    and (p.created_by = auth.uid() or public.is_admin())));

-- Votes: PUBLIC polls → members see rows (who voted). ANONYMOUS polls → each
-- user sees ONLY their own row; admins get no exception; aggregate counts come
-- exclusively from poll_results(). Writes only via cast_poll_vote().
create policy poll_votes_select on public.poll_votes for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.polls p where p.id = poll_id
        and p.visibility = 'public'
        and (public.is_admin() or public.is_group_member(p.group_id)))
  );

-- ── Realtime: live reactions, votes and pins ─────────────────────────────────
alter publication supabase_realtime add table public.message_reactions;
alter publication supabase_realtime add table public.poll_votes;
alter publication supabase_realtime add table public.message_pins;
