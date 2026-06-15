-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Profit Sharing records (Module 4, Profit Sharing tab).                    ║
-- ║                                                                            ║
-- ║  A SHARED company ledger of saved profit-sharing splits. Unlike            ║
-- ║  cost_calculations (a private per-user notebook), these are visible to     ║
-- ║  everyone who can view Profit: one record = one complete split snapshot    ║
-- ║  (total + currency + N partners, each with their percent and computed      ║
-- ║  amount). Record 1 might split between 2 partners, record 2 between 3 —    ║
-- ║  the tab lists the whole collection.                                       ║
-- ║                                                                            ║
-- ║  Money: PLAIN display units (like cost_calculations), NOT the ×100 ledger. ║
-- ║  RLS: read = any profit viewer; insert = self + profit.view; update        ║
-- ║  (rename / soft-delete) = owner only. Admin "delete anyone's" is performed ║
-- ║  server-side via the service-role client in the permission-gated action,   ║
-- ║  so the policy is never widened here.                                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create table public.profit_sharing_records (
  id              uuid primary key default gen_random_uuid(),
  created_by      uuid not null references public.users (id) on delete cascade,
  created_by_name text not null default '',            -- snapshot of the author's name
  label           text not null default '',            -- record name ('' → "Untitled split")
  note            text not null default '',
  currency        text not null default 'VND',         -- VND/USD/EUR/GBP/JPY (validated in the action)
  total           numeric(18,2) not null default 0,    -- plain display units
  partners        jsonb not null default '[]'::jsonb,  -- [{name, percent, amount}]
  partner_count   int  not null default 0,
  is_active       boolean not null default true,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now()
);

-- Shared ledger, newest first.
create index idx_psr_created on public.profit_sharing_records (created_at desc)
  where deleted_at is null;

grant select, insert, update on public.profit_sharing_records to authenticated;
alter table public.profit_sharing_records enable row level security;

-- Read: anyone who can view Profit sees the whole collection.
create policy psr_select on public.profit_sharing_records for select to authenticated
  using (public.has_permission('profit.view'));

-- Insert: a profit viewer creating their own record.
create policy psr_insert on public.profit_sharing_records for insert to authenticated
  with check (created_by = auth.uid() and public.has_permission('profit.view'));

-- Update (rename / soft-delete): owner only. Admin override is done by the
-- server action via the service-role client, never widened here.
create policy psr_update on public.profit_sharing_records for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());
