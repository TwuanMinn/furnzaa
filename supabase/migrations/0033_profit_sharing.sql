-- Profit Sharing calculator (Profit module, 3rd tab).
-- Persists each user's split configuration — partners, names, percentages,
-- currency and total — so it survives a browser clear (backend-backed, not
-- localStorage). Stored as a JSONB blob on the existing per-user
-- user_preferences row, so it inherits that table's RLS (own-row only),
-- grants, and updated_at trigger — no new table or policies required.
alter table public.user_preferences
  add column if not exists profit_sharing_config jsonb;

comment on column public.user_preferences.profit_sharing_config is
  'Profit Sharing tab state: { partners: [{name, percent}], currency, total }.';
