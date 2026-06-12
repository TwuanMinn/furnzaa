-- The hash-chain trigger overwrites these on every insert; the defaults exist
-- so the generated Insert type treats them as optional (callers must never
-- supply them).
alter table public.activity_logs alter column chain_seq set default 0;
alter table public.activity_logs alter column prev_hash set default '';
alter table public.activity_logs alter column row_hash set default '';
