-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Supabase Realtime wiring (Phases 7–8).                                    ║
-- ║  postgres_changes subscriptions respect RLS using the subscriber's JWT:     ║
-- ║   • notification_reads — live bell/unread updates (rows are per-user).      ║
-- ║   • messages — live chat in groups the user belongs to.                     ║
-- ║  REPLICA IDENTITY FULL on messages so UPDATE events (edit/delete) carry     ║
-- ║  the full row to subscribers.                                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

alter publication supabase_realtime add table public.notification_reads;
alter publication supabase_realtime add table public.messages;

alter table public.messages replica identity full;
