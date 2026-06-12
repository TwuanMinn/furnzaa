-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Spec v6 — three new modules in one migration so the schema contract       ║
-- ║  can't drift between parallel build sessions:                              ║
-- ║    • Production Schedule (print_schedule, derived from orders' print       ║
-- ║      state by trigger — ONE source of truth, same-transaction upserts)     ║
-- ║    • Trending Products (+ votes with incremental counts)                   ║
-- ║    • Customer Feedback (+ attachments/status history/comments, CRM         ║
-- ║      loop-back aggregates on customers)                                    ║
-- ║  Plus: new permission keys, Settings config columns, storage buckets,      ║
-- ║  realtime publication. MUST stay in sync with src/lib/rbac/permissions.ts. ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 1. Permissions ────────────────────────────────────────────────────────────
insert into public.permissions (key, description, module) values
  ('trends.create',           'Add trending-product entries and upvote them',     'trends'),
  ('trends.manage',           'Edit/approve/archive trending-product entries',    'trends'),
  ('trends.promote',          'Promote a trending entry to a real product',       'trends'),
  ('feedback.create',         'Submit customer feedback records',                 'feedback'),
  ('feedback.assign',         'Assign feedback records to reviewers',             'feedback'),
  ('feedback.resolve',        'Resolve/reopen feedback records',                  'feedback'),
  ('feedback.view_all',       'View every feedback record',                       'feedback'),
  ('feedback.analytics_view', 'View feedback analytics',                          'feedback'),
  ('schedule.view',           'View the production schedule board',               'schedule'),
  ('schedule.manage',         'Manage every job on the production schedule',      'schedule')
on conflict (key) do update set description = excluded.description, module = excluded.module;

-- Admin → everything (idempotent catch-up).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'admin'
on conflict do nothing;

-- Staff (mirror of STAFF_PERMS in permissions.ts): add/upvote trends, submit +
-- resolve-their-own feedback, view/manage their own schedule jobs.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
join public.permissions p on p.key in
  ('trends.create', 'feedback.create', 'feedback.resolve', 'schedule.view')
where r.key = 'staff'
on conflict do nothing;

-- ── 2. Settings config columns ────────────────────────────────────────────────
alter table public.organization_settings
  add column if not exists schedule_config jsonb not null default '{
    "completed_retention_hours": 24,
    "overdue_alert_pct": 20
  }'::jsonb,
  add column if not exists trending_config jsonb not null default '{
    "platforms": ["MakerWorld","Printables","Thingiverse","Cults3D","Etsy","TikTok","Facebook","Shopee","Other"],
    "statuses": [
      {"key":"researching","label":"Researching","color":"blue"},
      {"key":"approved","label":"Approved","color":"green"},
      {"key":"in_production","label":"In Production","color":"indigo"},
      {"key":"selling","label":"Selling","color":"violet"},
      {"key":"rejected","label":"Rejected","color":"red"},
      {"key":"archived","label":"Archived","color":"slate"}
    ],
    "target_margin_pct": 20
  }'::jsonb,
  add column if not exists feedback_config jsonb not null default '{
    "categories": ["Product Quality","Print Defect","Shipping/Delivery","Customer Service","Pricing","Other"],
    "severities": [
      {"key":"low","label":"Low","color":"slate"},
      {"key":"medium","label":"Medium","color":"amber"},
      {"key":"high","label":"High","color":"red"}
    ],
    "channels": ["In person","Phone","Facebook","Zalo","TikTok","Email","Other"],
    "aging_sla_days": 7,
    "negative_alert_enabled": true
  }'::jsonb;

-- ── 3. CRM loop-back aggregates ───────────────────────────────────────────────
alter table public.customers
  add column if not exists feedback_count integer not null default 0,
  add column if not exists avg_rating numeric(4, 2);

-- ═══════════════════════ 4. PRODUCTION SCHEDULE ══════════════════════════════

create table public.print_schedule (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null unique references public.orders (id) on delete cascade,
  printer_id          uuid references public.printers (id) on delete set null,
  assigned_to         uuid references public.users (id) on delete set null,
  state               text not null check (state in ('queued', 'printing', 'completed', 'failed')),
  -- Sparse ordering key: one reorder updates ONE row (midpoint insertion).
  queue_position      numeric not null default 0,
  scheduled_at        timestamptz not null default now(),
  print_started_at    timestamptz,
  estimated_minutes   integer,
  actual_minutes      integer,
  completed_at        timestamptz,
  archived_at         timestamptz,
  -- Idempotency stamp for the cron overdue alert (re-armed on restart).
  overdue_notified_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.users (id) on delete set null
);

create index idx_schedule_printer_state_pos on public.print_schedule (printer_id, state, queue_position);
create index idx_schedule_state    on public.print_schedule (state);
create index idx_schedule_assigned on public.print_schedule (assigned_to);
create index idx_schedule_started  on public.print_schedule (print_started_at);
create index idx_schedule_archived on public.print_schedule (archived_at);
create trigger trg_print_schedule_updated before update on public.print_schedule
  for each row execute function public.set_updated_at();

-- The board derives from the orders print state machine — ONE source of truth.
-- This trigger keeps print_schedule in the SAME TRANSACTION as every print
-- action and every printer/estimate assignment, idempotently (unique order_id).
create or replace function public.sync_print_schedule()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_state text;
  v_warranted boolean;
  v_tail numeric;
begin
  -- A schedule row is warranted once the order has a printer + estimate
  -- (auto-queue) or has ever left not_started; soft-deleted orders drop off.
  v_warranted := coalesce(new.is_active, true)
    and (new.print_state <> 'not_started'
         or (new.printer_id is not null and new.estimated_print_minutes is not null));

  if not v_warranted then
    -- Un-assignment / soft-delete while still queued → back to the
    -- unassigned tray (which reads from orders); finished history stays.
    delete from public.print_schedule
      where order_id = new.id and state = 'queued';
    return new;
  end if;

  v_state := case new.print_state
    when 'printing'  then 'printing'
    when 'completed' then 'completed'
    when 'failed'    then 'failed'
    else 'queued'
  end;

  select coalesce(max(queue_position), 0) + 1024 into v_tail
  from public.print_schedule
  where printer_id is not distinct from new.printer_id and state = 'queued';

  insert into public.print_schedule as ps
    (order_id, printer_id, assigned_to, state, queue_position,
     print_started_at, estimated_minutes, actual_minutes, completed_at, updated_by)
  values
    (new.id, new.printer_id, new.assigned_staff_id, v_state, v_tail,
     new.print_started_at, new.estimated_print_minutes, new.actual_print_minutes,
     case when v_state = 'completed' then now() end, new.updated_by)
  on conflict (order_id) do update set
    printer_id        = excluded.printer_id,
    assigned_to       = excluded.assigned_to,
    state             = excluded.state,
    print_started_at  = excluded.print_started_at,
    estimated_minutes = excluded.estimated_minutes,
    actual_minutes    = excluded.actual_minutes,
    completed_at      = case
      when excluded.state = 'completed' and ps.state <> 'completed' then now()
      when excluded.state <> 'completed' then null
      else ps.completed_at
    end,
    -- Restart / re-queue pulls the card back onto the live board.
    archived_at       = case when excluded.state in ('queued', 'printing') then null
                             else ps.archived_at end,
    overdue_notified_at = case when excluded.state = 'printing' and ps.state <> 'printing'
                               then null else ps.overdue_notified_at end,
    -- Keep the position unless the job moved to another printer's queue.
    queue_position    = case
      when excluded.state = 'queued'
       and (ps.printer_id is distinct from excluded.printer_id or ps.state <> 'queued')
      then excluded.queue_position
      else ps.queue_position
    end,
    updated_by        = excluded.updated_by;
  return new;
end;
$$;

create trigger trg_sync_print_schedule
  after insert or update of
    print_state, printer_id, estimated_print_minutes, assigned_staff_id,
    print_started_at, actual_print_minutes, is_active
  on public.orders
  for each row execute function public.sync_print_schedule();

-- Backfill: every existing order that warrants a schedule row gets one, with
-- queue positions in priority-then-age order per printer.
insert into public.print_schedule
  (order_id, printer_id, assigned_to, state, queue_position,
   print_started_at, estimated_minutes, actual_minutes, completed_at, updated_by)
select
  o.id, o.printer_id, o.assigned_staff_id,
  case o.print_state
    when 'printing' then 'printing' when 'completed' then 'completed'
    when 'failed' then 'failed' else 'queued' end,
  row_number() over (partition by o.printer_id order by o.created_at) * 1024,
  o.print_started_at, o.estimated_print_minutes, o.actual_print_minutes,
  case when o.print_state = 'completed' then o.updated_at end,
  o.updated_by
from public.orders o
where o.is_active
  and (o.print_state <> 'not_started'
       or (o.printer_id is not null and o.estimated_print_minutes is not null))
on conflict (order_id) do nothing;

-- RLS: everyone signed-in reads the board (staff get a read-only "view all"
-- toggle); all writes flow through server actions (service role) or the
-- definer sync trigger — no direct write grants.
grant select on public.print_schedule to authenticated;
alter table public.print_schedule enable row level security;
create policy schedule_select on public.print_schedule for select to authenticated using (true);

alter publication supabase_realtime add table public.print_schedule;

-- ═══════════════════════ 5. TRENDING PRODUCTS ════════════════════════════════

create table public.trending_products (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  source_platform      text not null default 'Other',
  source_url           text,
  category_id          uuid references public.product_categories (id) on delete set null,
  description          text,
  -- Up to 5 storage URLs; first is the cover (enforced in the app layer).
  images               jsonb not null default '[]'::jsonb,
  est_print_minutes    integer,
  suggested_material   text,
  est_filament_grams   integer,
  est_selling_cents    bigint,
  est_cost_cents       bigint,
  popularity_score     integer not null default 50 check (popularity_score between 1 and 100),
  tags                 text[] not null default '{}',
  trend_status         text not null default 'researching',
  notes                text,
  votes_count          integer not null default 0,
  promoted_product_id  uuid references public.products (id) on delete set null,
  added_by             uuid references public.users (id) on delete set null,
  is_active            boolean not null default true,
  deleted_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references public.users (id) on delete set null
);

create index idx_trends_name_trgm  on public.trending_products using gin (name extensions.gin_trgm_ops);
create index idx_trends_status     on public.trending_products (trend_status);
create index idx_trends_platform   on public.trending_products (source_platform);
create index idx_trends_category   on public.trending_products (category_id);
create index idx_trends_popularity on public.trending_products (popularity_score);
create index idx_trends_votes      on public.trending_products (votes_count);
create index idx_trends_keyset     on public.trending_products (created_at desc, id desc);
create index idx_trends_promoted   on public.trending_products (promoted_product_id);
create index idx_trends_tags       on public.trending_products using gin (tags);
create index idx_trends_added_by   on public.trending_products (added_by);
create trigger trg_trends_updated before update on public.trending_products
  for each row execute function public.set_updated_at();

create table public.trending_product_votes (
  trending_product_id uuid not null references public.trending_products (id) on delete cascade,
  user_id             uuid not null references public.users (id) on delete cascade,
  created_at          timestamptz not null default now(),
  primary key (trending_product_id, user_id)
);

-- Incremental vote counts — never COUNT(*) per request.
create or replace function public.bump_trend_votes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.trending_products set votes_count = votes_count + 1
      where id = new.trending_product_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.trending_products set votes_count = greatest(votes_count - 1, 0)
      where id = old.trending_product_id;
    return old;
  end if;
  return null;
end;
$$;
create trigger trg_trend_votes after insert or delete on public.trending_product_votes
  for each row execute function public.bump_trend_votes();

-- RLS: all active users read; create needs trends.create (and owns the row);
-- edits need trends.manage. Votes: one per user, own-row insert/delete.
grant select, insert, update on public.trending_products to authenticated;
grant select, insert, delete on public.trending_product_votes to authenticated;
alter table public.trending_products enable row level security;
alter table public.trending_product_votes enable row level security;

create policy trends_select on public.trending_products for select to authenticated using (true);
create policy trends_insert on public.trending_products for insert to authenticated
  with check (public.has_permission('trends.create') and added_by = auth.uid());
create policy trends_update on public.trending_products for update to authenticated
  using (public.has_permission('trends.manage'))
  with check (public.has_permission('trends.manage'));

create policy trend_votes_select on public.trending_product_votes for select to authenticated using (true);
create policy trend_votes_insert on public.trending_product_votes for insert to authenticated
  with check (user_id = auth.uid() and public.has_permission('trends.create'));
create policy trend_votes_delete on public.trending_product_votes for delete to authenticated
  using (user_id = auth.uid());

-- ═══════════════════════ 6. CUSTOMER FEEDBACK ════════════════════════════════

create sequence public.feedback_code_seq;
grant usage on sequence public.feedback_code_seq to service_role;

create table public.customer_feedback (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique
                     default ('F-' || lpad(nextval('public.feedback_code_seq')::text, 4, '0')),
  customer_id        uuid references public.customers (id) on delete set null,
  -- Walk-in fallback when no customer record matches.
  fallback_name      text,
  fallback_phone     text,
  order_id           uuid references public.orders (id) on delete set null,
  rating             integer not null check (rating between 1 and 5),
  comments           text not null,
  category           text not null default 'Other',
  source_channel     text not null default 'In person',
  severity           text not null default 'low' check (severity in ('low', 'medium', 'high')),
  status             text not null default 'new'
                     check (status in ('new', 'in_progress', 'resolved', 'reopened')),
  assigned_to        uuid references public.users (id) on delete set null,
  resolved_by        uuid references public.users (id) on delete set null,
  resolved_at        timestamptz,
  resolution_note    text,
  -- Idempotency stamp for the cron aging-SLA alert.
  aging_notified_at  timestamptz,
  submitted_by       uuid references public.users (id) on delete set null,
  comments_tsv       tsvector generated always as (to_tsvector('simple', coalesce(comments, ''))) stored,
  is_active          boolean not null default true,
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references public.users (id) on delete set null
);

create index idx_feedback_rating    on public.customer_feedback (rating);
create index idx_feedback_status    on public.customer_feedback (status);
create index idx_feedback_category  on public.customer_feedback (category);
create index idx_feedback_severity  on public.customer_feedback (severity);
create index idx_feedback_assigned  on public.customer_feedback (assigned_to);
create index idx_feedback_customer  on public.customer_feedback (customer_id);
create index idx_feedback_order     on public.customer_feedback (order_id);
create index idx_feedback_channel   on public.customer_feedback (source_channel);
create index idx_feedback_keyset    on public.customer_feedback (created_at desc, id desc);
create index idx_feedback_resolved  on public.customer_feedback (resolved_at);
create index idx_feedback_fts       on public.customer_feedback using gin (comments_tsv);
create trigger trg_feedback_updated before update on public.customer_feedback
  for each row execute function public.set_updated_at();

create table public.feedback_attachments (
  id           uuid primary key default gen_random_uuid(),
  feedback_id  uuid not null references public.customer_feedback (id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  mime_type    text not null,
  size_bytes   bigint not null default 0,
  created_by   uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index idx_feedback_attachments on public.feedback_attachments (feedback_id);

create table public.feedback_status_history (
  id          uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.customer_feedback (id) on delete cascade,
  from_status text,
  to_status   text not null,
  changed_by  uuid references public.users (id) on delete set null,
  comment     text,
  created_at  timestamptz not null default now()
);
create index idx_feedback_history on public.feedback_status_history (feedback_id, created_at);

create table public.feedback_comments (
  id          uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.customer_feedback (id) on delete cascade,
  author_id   uuid references public.users (id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index idx_feedback_comments on public.feedback_comments (feedback_id, created_at);

-- CRM loop-back: per-customer feedback count + average rating, maintained
-- incrementally on insert / rating change / soft-delete / customer move.
create or replace function public.bump_customer_feedback_stats()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old_counted boolean := tg_op <> 'INSERT'
    and old.customer_id is not null and old.deleted_at is null;
  v_new_counted boolean := tg_op <> 'DELETE'
    and new.customer_id is not null and new.deleted_at is null;
begin
  if v_old_counted and v_new_counted
     and old.customer_id = new.customer_id and old.rating = new.rating then
    return coalesce(new, old); -- nothing aggregate-relevant changed
  end if;

  if v_old_counted then
    update public.customers c set
      feedback_count = greatest(c.feedback_count - 1, 0),
      avg_rating = case when c.feedback_count <= 1 then null
        else round(((c.avg_rating * c.feedback_count) - old.rating) / (c.feedback_count - 1), 2) end
      where c.id = old.customer_id;
  end if;
  if v_new_counted then
    update public.customers c set
      feedback_count = c.feedback_count + 1,
      avg_rating = round(
        (coalesce(c.avg_rating, 0) * c.feedback_count + new.rating) / (c.feedback_count + 1), 2)
      where c.id = new.customer_id;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger trg_feedback_stats
  after insert or update of rating, customer_id, deleted_at or delete
  on public.customer_feedback
  for each row execute function public.bump_customer_feedback_stats();

-- RLS: staff see records they submitted or are assigned to; feedback.view_all
-- (Admin) sees everything. All writes go through server actions (service
-- role) so workflow rules (required resolution note, state machine) hold.
grant select on public.customer_feedback, public.feedback_attachments,
  public.feedback_status_history, public.feedback_comments to authenticated;
alter table public.customer_feedback     enable row level security;
alter table public.feedback_attachments  enable row level security;
alter table public.feedback_status_history enable row level security;
alter table public.feedback_comments     enable row level security;

create policy feedback_select on public.customer_feedback for select to authenticated
  using (public.has_permission('feedback.view_all')
         or submitted_by = auth.uid() or assigned_to = auth.uid());

create policy feedback_attachments_select on public.feedback_attachments for select to authenticated
  using (exists (select 1 from public.customer_feedback f where f.id = feedback_id
                 and (public.has_permission('feedback.view_all')
                      or f.submitted_by = auth.uid() or f.assigned_to = auth.uid())));
create policy feedback_history_select on public.feedback_status_history for select to authenticated
  using (exists (select 1 from public.customer_feedback f where f.id = feedback_id
                 and (public.has_permission('feedback.view_all')
                      or f.submitted_by = auth.uid() or f.assigned_to = auth.uid())));
create policy feedback_comments_select on public.feedback_comments for select to authenticated
  using (exists (select 1 from public.customer_feedback f where f.id = feedback_id
                 and (public.has_permission('feedback.view_all')
                      or f.submitted_by = auth.uid() or f.assigned_to = auth.uid())));

-- ── 7. Storage buckets ───────────────────────────────────────────────────────
-- Trending reference images: public (like product-images). Feedback photos:
-- private — served via short-lived signed URLs from the server.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('trending', 'trending', true,  5242880, array['image/png','image/jpeg','image/webp']),
  ('feedback', 'feedback', false, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

create policy "trending_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'trending' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "trending_read" on storage.objects for select to authenticated
  using (bucket_id = 'trending');
create policy "feedback_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback' and (storage.foldername(name))[1] = auth.uid()::text);
