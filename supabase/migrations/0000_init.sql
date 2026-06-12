-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Furnza — initial schema. Designed for ~1M customers / many millions of    ║
-- ║  orders. Conventions:                                                      ║
-- ║   • uuid PKs (gen_random_uuid), timestamptz everywhere.                     ║
-- ║   • Money = integer minor units (bigint cents). No floats.                 ║
-- ║   • Status/priority are TEXT (NOT enums) — Admins edit the lists in         ║
-- ║     Settings; validated in app + against the settings JSON.                 ║
-- ║   • Soft delete: is_active + deleted_at.                                    ║
-- ║   • Indexes on every searched/filtered/sorted column. Fuzzy text via        ║
-- ║     pg_trgm GIN; message bodies via tsvector FTS. Keyset pagination via      ║
-- ║     composite (created_at desc, id desc) btrees.                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;     -- trigram fuzzy search
create extension if not exists btree_gin with schema extensions;   -- composite GIN where useful

-- ── Shared helpers ──────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── RBAC: roles, permissions, role_permissions ──────────────────────────────
create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,            -- 'admin' | 'staff'
  name        text not null,
  description text,
  is_system   boolean not null default false,
  rank        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_roles_updated before update on public.roles
  for each row execute function public.set_updated_at();

create table public.permissions (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,            -- e.g. 'orders.create'
  description text not null,
  module      text not null,
  created_at  timestamptz not null default now()
);
create index idx_permissions_module on public.permissions (module);

create table public.role_permissions (
  role_id       uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);
create index idx_role_permissions_permission on public.role_permissions (permission_id);

-- ── Users (profile mirror of auth.users) ────────────────────────────────────
create table public.users (
  id                  uuid primary key references auth.users (id) on delete cascade,
  full_name           text not null default '',
  email               text not null,
  role_id             uuid not null references public.roles (id),
  phone               text,
  department          text,
  avatar_url          text,
  is_active           boolean not null default true,
  deleted_at          timestamptz,
  last_login_at       timestamptz,
  must_reset_password boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index uq_users_email_lower on public.users (lower(email));
create index idx_users_role on public.users (role_id);
create index idx_users_is_active on public.users (is_active);
create index idx_users_created_keyset on public.users (created_at desc, id desc);
create index idx_users_fullname_trgm on public.users using gin (full_name extensions.gin_trgm_ops);
create index idx_users_email_trgm on public.users using gin (email extensions.gin_trgm_ops);
create trigger trg_users_updated before update on public.users
  for each row execute function public.set_updated_at();

-- ── User preferences (per-user shell/UX settings) ───────────────────────────
create table public.user_preferences (
  user_id               uuid primary key references public.users (id) on delete cascade,
  theme                 text not null default 'system',      -- light|dark|system
  language              text not null default 'en',
  default_landing_page  text not null default '/dashboard',
  sidebar_collapsed     boolean not null default false,
  sidebar_default_state text not null default 'expanded',     -- expanded|collapsed
  date_format           text not null default 'MMM d, yyyy',
  time_format           text not null default 'h:mm a',
  timezone              text not null default 'UTC',
  notification_prefs    jsonb not null default '{}'::jsonb,   -- per-event toggles, channels, quiet hours
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger trg_user_prefs_updated before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ── Customers ───────────────────────────────────────────────────────────────
create table public.customers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text,
  phone      text,
  notes      text,
  is_active  boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_customers_created_keyset on public.customers (created_at desc, id desc);
create index idx_customers_name_trgm on public.customers using gin (name extensions.gin_trgm_ops);
create index idx_customers_email_trgm on public.customers using gin (coalesce(email, '') extensions.gin_trgm_ops);
create index idx_customers_phone_trgm on public.customers using gin (coalesce(phone, '') extensions.gin_trgm_ops);
create trigger trg_customers_updated before update on public.customers
  for each row execute function public.set_updated_at();

-- ── Orders ──────────────────────────────────────────────────────────────────
create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  order_code        text not null unique,                 -- lookup key, e.g. FZ-2026-000123
  customer_id       uuid not null references public.customers (id),
  buying_date       date not null,
  priority          text not null default 'medium',       -- low|medium|high|extreme
  status            text not null default 'pending',      -- pending|processing|shipped|delivered|returned|cancelled
  phone             text,
  email             text,
  shipping_address  text,
  delivery_date     date,
  payment_method    text,
  payment_status    text not null default 'unpaid' check (payment_status in ('paid','unpaid','refunded')),
  notes             text,
  receipt_url       text,
  subtotal_cents    bigint not null default 0,
  tax_cents         bigint not null default 0,
  total_cents       bigint not null default 0,
  currency          text not null default 'USD',
  custom_fields     jsonb not null default '{}'::jsonb,
  is_active         boolean not null default true,
  deleted_at        timestamptz,
  assigned_staff_id uuid references public.users (id) on delete set null,
  created_by        uuid references public.users (id) on delete set null,
  updated_by        uuid references public.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- Filter/sort indexes (every filtered/sorted column from the spec):
create index idx_orders_status on public.orders (status);
create index idx_orders_priority on public.orders (priority);
create index idx_orders_payment_status on public.orders (payment_status);
create index idx_orders_assigned on public.orders (assigned_staff_id);
create index idx_orders_created_by on public.orders (created_by);
create index idx_orders_customer on public.orders (customer_id);
create index idx_orders_buying_date on public.orders (buying_date desc);
create index idx_orders_delivery_date on public.orders (delivery_date desc);
-- Keyset pagination default sort (created_at desc, id desc):
create index idx_orders_created_keyset on public.orders (created_at desc, id desc);
-- Common staff-scoped listing path (assigned + recency):
create index idx_orders_assigned_created on public.orders (assigned_staff_id, created_at desc, id desc);
-- Fuzzy lookup by code / snapshot contact fields:
create index idx_orders_code_trgm on public.orders using gin (order_code extensions.gin_trgm_ops);
create index idx_orders_email_trgm on public.orders using gin (coalesce(email, '') extensions.gin_trgm_ops);
create index idx_orders_phone_trgm on public.orders using gin (coalesce(phone, '') extensions.gin_trgm_ops);
create trigger trg_orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  name             text not null,
  quantity         int not null default 1 check (quantity >= 0),
  unit_price_cents bigint not null default 0,
  line_total_cents bigint not null default 0,
  sort_order       int not null default 0
);
create index idx_order_items_order on public.order_items (order_id);

create table public.order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  from_status text,
  to_status   text not null,
  comment     text,
  changed_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index idx_osh_order on public.order_status_history (order_id, created_at desc);

-- ── Notifications ─────────────────────────────────────────────────────────────
create table public.notifications (
  id             uuid primary key default gen_random_uuid(),
  type           text not null default 'system',     -- manual|system
  category       text,                               -- order_assigned|order_delivered|new_message|manual
  title          text not null,
  body           text not null default '',
  audience_type  text not null default 'users',      -- all|role|users
  audience_value jsonb,                              -- role key or [userIds] for display/audit
  link_url       text,
  sender_id      uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index idx_notifications_created on public.notifications (created_at desc, id desc);
create index idx_notifications_type on public.notifications (type);

create table public.notification_reads (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  read_at         timestamptz,
  created_at      timestamptz not null default now(),
  unique (notification_id, user_id)
);
-- Fast "my unread count" and "my recent notifications":
create index idx_notif_reads_user_unread on public.notification_reads (user_id, read_at, created_at desc);

-- ── Messages ──────────────────────────────────────────────────────────────────
create table public.message_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text,                          -- null for direct conversations
  type        text not null default 'group', -- group|direct
  created_by  uuid references public.users (id) on delete set null,
  is_active   boolean not null default true,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_message_groups_type on public.message_groups (type);
create index idx_message_groups_name_trgm on public.message_groups using gin (coalesce(name, '') extensions.gin_trgm_ops);
create trigger trg_message_groups_updated before update on public.message_groups
  for each row execute function public.set_updated_at();

create table public.group_members (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.message_groups (id) on delete cascade,
  user_id     uuid not null references public.users (id) on delete cascade,
  role        text not null default 'member', -- owner|member
  last_read_at timestamptz,
  joined_at   timestamptz not null default now(),
  unique (group_id, user_id)
);
create index idx_group_members_user on public.group_members (user_id);

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.message_groups (id) on delete cascade,
  sender_id  uuid references public.users (id) on delete set null,
  body       text not null default '',
  edited     boolean not null default false,
  edited_at  timestamptz,
  deleted    boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  -- Full-text search over message bodies (spec: index message bodies):
  body_tsv   tsvector generated always as (to_tsvector('english', coalesce(body, ''))) stored
);
create index idx_messages_group_created on public.messages (group_id, created_at desc);
create index idx_messages_sender on public.messages (sender_id);
create index idx_messages_body_fts on public.messages using gin (body_tsv);

create table public.message_attachments (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  file_name  text not null,
  file_url   text not null,
  storage_path text not null default '',
  mime_type  text not null,
  size_bytes bigint not null default 0,
  kind       text not null default 'file', -- image|file
  created_at timestamptz not null default now()
);
create index idx_message_attachments_message on public.message_attachments (message_id);

-- ── Activity log (append-only) ──────────────────────────────────────────────
create table public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.users (id) on delete set null,
  actor_email text,                       -- snapshot; survives hard-delete
  action      text not null,              -- 'user.create', 'order.status_change', ...
  module      text not null,              -- users|orders|auth|messages|settings|notifications|logs
  target_type text,
  target_id   text,
  summary     text not null,
  before_data jsonb,
  after_data  jsonb,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index idx_activity_created_keyset on public.activity_logs (created_at desc, id desc);
create index idx_activity_actor on public.activity_logs (actor_id, created_at desc);
create index idx_activity_module on public.activity_logs (module);
create index idx_activity_action on public.activity_logs (action);
create index idx_activity_target on public.activity_logs (target_type, target_id);
create index idx_activity_summary_trgm on public.activity_logs using gin (summary extensions.gin_trgm_ops);

-- ── Settings ──────────────────────────────────────────────────────────────────
-- Singleton org-wide settings (id is always 'org').
create table public.organization_settings (
  id                  text primary key default 'org' check (id = 'org'),
  company_name        text not null default 'Furnza',
  logo_url            text,
  address_line        text,
  contact_email       text,
  contact_phone       text,
  currency            text not null default 'USD',
  default_tax_rate    numeric(6,3) not null default 0,   -- percent, e.g. 8.500
  order_statuses      jsonb not null default '[]'::jsonb, -- [{key,label,color,isFinal}]
  order_priorities    jsonb not null default '[]'::jsonb, -- [{key,label,color}]
  order_code_prefix   text not null default 'FZ',
  order_code_format   text not null default '{prefix}-{yyyy}-{seq}',
  custom_order_fields jsonb not null default '[]'::jsonb,
  password_policy     jsonb not null default '{}'::jsonb,
  session_timeout_min int not null default 60,
  two_factor_required boolean not null default false,
  login_attempt_limit int not null default 5,
  lockout_minutes     int not null default 15,
  log_retention_days  int not null default 365,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger trg_org_settings_updated before update on public.organization_settings
  for each row execute function public.set_updated_at();

-- ── Order-code sequence counters (atomic per prefix-year) ───────────────────
create table public.order_code_counters (
  prefix_year text primary key,   -- e.g. 'FZ-2026'
  value       bigint not null default 0
);

comment on table public.orders is 'Delivered/tracked customer orders. Money in integer cents.';
comment on table public.activity_logs is 'Append-only audit trail. Never UPDATEd; only Admin may purge.';
