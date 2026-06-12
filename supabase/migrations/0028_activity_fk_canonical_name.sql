-- 0024 built the partitioned activity log as activity_logs_v6 and renamed the
-- TABLE afterwards, but Postgres keeps constraint names — leaving the actor FK
-- as activity_logs_v6_actor_id_fkey. PostgREST resolves embeds by constraint
-- name, so the activity dataset's `actor:users!activity_logs_actor_id_fkey`
-- hint stopped matching ("could not find a relationship"). Restore the
-- canonical name and reload the API schema cache.

alter table public.activity_logs
  rename constraint activity_logs_v6_actor_id_fkey to activity_logs_actor_id_fkey;

notify pgrst, 'reload schema';
