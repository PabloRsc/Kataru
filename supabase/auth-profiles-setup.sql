-- Kataru authentication profiles.
-- This file mirrors the profile setup already applied to the connected Supabase project.
-- Safe additive setup: does not alter anime_collection or anime_lists.

begin;

create table if not exists public.kataru_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kataru_profiles_username_format
    check (username ~ '^[A-Za-z0-9_]{3,20}$')
);

create unique index if not exists kataru_profiles_username_lower_key
  on public.kataru_profiles (lower(username));

alter table public.kataru_profiles enable row level security;

drop policy if exists "Users can read their own Kataru profile" on public.kataru_profiles;
create policy "Users can read their own Kataru profile"
  on public.kataru_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own Kataru profile" on public.kataru_profiles;
create policy "Users can update their own Kataru profile"
  on public.kataru_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, update on table public.kataru_profiles to authenticated;
revoke all on table public.kataru_profiles from anon;

create or replace function public.is_kataru_username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    candidate is not null
    and candidate ~ '^[A-Za-z0-9_]{3,20}$'
    and lower(candidate) not in ('admin', 'administrator', 'support', 'kataru', 'root', 'api')
    and not exists (
      select 1 from public.kataru_profiles profile
      where lower(profile.username) = lower(candidate)
    );
$$;

revoke all on function public.is_kataru_username_available(text) from public;
grant execute on function public.is_kataru_username_available(text) to anon, authenticated;

create or replace function public.handle_kataru_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
begin
  requested_username := nullif(btrim(new.raw_user_meta_data ->> 'username'), '');
  if requested_username is not null then
    insert into public.kataru_profiles (user_id, username)
    values (new.id, requested_username);
  end if;
  return new;
end;
$$;

revoke all on function public.handle_kataru_new_auth_user() from public;
grant execute on function public.handle_kataru_new_auth_user() to service_role;

drop trigger if exists on_kataru_auth_user_created on auth.users;
create trigger on_kataru_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_kataru_new_auth_user();

notify pgrst, 'reload schema';
commit;
