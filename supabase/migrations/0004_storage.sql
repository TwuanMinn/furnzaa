-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Supabase Storage buckets + RLS policies on storage.objects.               ║
-- ║   • avatars      — public read; users write only their own folder.          ║
-- ║   • receipts     — private; owner/admin access; cross-user reads via         ║
-- ║                    server-generated signed URLs after an access check.       ║
-- ║   • attachments  — private; same pattern (message-group members get signed   ║
-- ║                    URLs from the server).                                    ║
-- ║  Created via SQL so buckets exist on BOTH local and cloud (portable).        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 5242880,
   array['image/png','image/jpeg','image/webp','image/gif']),
  ('receipts', 'receipts', false, 10485760,
   array['image/png','image/jpeg','image/webp','application/pdf']),
  ('attachments', 'attachments', false, 26214400,
   array['image/png','image/jpeg','image/webp','image/gif','application/pdf',
         'text/plain','text/csv','application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── avatars: public read, self-managed writes (path = <uid>/<file>) ─────────
create policy avatars_read on storage.objects for select
  using (bucket_id = 'avatars');
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid())
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid());

-- ── receipts + attachments: private; owner or admin ─────────────────────────
create policy private_files_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('receipts','attachments') and owner = auth.uid());
create policy private_files_select on storage.objects for select to authenticated
  using (bucket_id in ('receipts','attachments') and (owner = auth.uid() or public.is_admin()));
create policy private_files_update on storage.objects for update to authenticated
  using (bucket_id in ('receipts','attachments') and (owner = auth.uid() or public.is_admin()))
  with check (bucket_id in ('receipts','attachments') and (owner = auth.uid() or public.is_admin()));
create policy private_files_delete on storage.objects for delete to authenticated
  using (bucket_id in ('receipts','attachments') and (owner = auth.uid() or public.is_admin()));
