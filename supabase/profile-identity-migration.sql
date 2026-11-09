-- Kataru profile identity update.
-- Align social profile dates with the original Auth account and replace the
-- generic migration label with the generated username for legacy accounts.
begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'kataru_profiles_username_length_check'
      and conrelid = 'public.kataru_profiles'::regclass
  ) then
    alter table public.kataru_profiles
      add constraint kataru_profiles_username_length_check
      check (char_length(username) between 3 and 20);
  end if;
end $;

revoke update on table public.kataru_profiles from authenticated;
grant update (username, display_name, bio) on table public.kataru_profiles to authenticated;

update public.kataru_profiles as profile
set
  created_at = auth_user.created_at,
  display_name = case
    when profile.display_name is null
      or btrim(profile.display_name) = ''
      or lower(btrim(profile.display_name)) = 'usuário kataru'
    then profile.username
    else profile.display_name
  end,
  updated_at = now()
from auth.users as auth_user
where auth_user.id = profile.user_id;

create or replace function public.handle_kataru_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $
declare
  requested_username text;
  requested_display_name text;
  requested_avatar text;
begin
  requested_username := nullif(btrim(new.raw_user_meta_data ->> 'username'), '');
  if requested_username is null or requested_username !~ '^[A-Za-z0-9_]{3,20}
commit;
 then
    requested_username := 'kataru_' || left(replace(new.id::text, '-', ''), 8);
  end if;
  requested_display_name := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), requested_username);
  requested_avatar := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), ''), nullif(btrim(new.raw_user_meta_data ->> 'picture'), ''));

  insert into public.kataru_profiles (user_id, username, display_name, bio, avatar_url, created_at)
  values (new.id, requested_username, requested_display_name, '', requested_avatar, new.created_at)
  on conflict (user_id) do nothing;
  return new;
end;
$;

revoke all on function public.handle_kataru_new_auth_user() from public, anon, authenticated;
grant execute on function public.handle_kataru_new_auth_user() to service_role;

notify pgrst, 'reload schema';
commit;
