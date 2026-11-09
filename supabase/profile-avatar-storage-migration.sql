-- Kataru public profile avatars.
-- Images are public for profile display; writes and deletes are restricted to
-- the authenticated owner folder (<auth.uid()>/<uuid>.<extension>).

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Kataru avatar upload to own folder" on storage.objects;
create policy "Kataru avatar upload to own folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Kataru avatar delete from own folder" on storage.objects;
create policy "Kataru avatar delete from own folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

revoke update on table public.kataru_profiles from authenticated;
grant update (username, display_name, bio, avatar_url)
on table public.kataru_profiles to authenticated;

notify pgrst, 'reload schema';
commit;
