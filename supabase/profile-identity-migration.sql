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
end $$;

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

notify pgrst, 'reload schema';
commit;
