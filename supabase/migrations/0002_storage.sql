-- PinViz storage v1
-- Creates the 'photos' bucket and RLS policies on storage.objects.

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "photos_insert_own" on storage.objects;
create policy "photos_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "photos_select_own" on storage.objects;
create policy "photos_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "photos_update_own" on storage.objects;
create policy "photos_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "photos_delete_own" on storage.objects;
create policy "photos_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
