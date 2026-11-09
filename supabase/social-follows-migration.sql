-- Kataru social: discoverable profiles, follows and safe shared content.
-- Requires the existing kataru_profiles table from auth-profiles-setup.sql.
-- Run once in the Supabase SQL Editor (or apply as a migration).
begin;

alter table public.kataru_profiles
  add column if not exists display_name text,
  add column if not exists bio text not null default '',
  add column if not exists avatar_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='kataru_profiles_display_name_length_check' and conrelid='public.kataru_profiles'::regclass) then
    alter table public.kataru_profiles add constraint kataru_profiles_display_name_length_check check (display_name is null or char_length(display_name) <= 50);
  end if;
  if not exists (select 1 from pg_constraint where conname='kataru_profiles_bio_length_check' and conrelid='public.kataru_profiles'::regclass) then
    alter table public.kataru_profiles add constraint kataru_profiles_bio_length_check check (char_length(bio) <= 160);
  end if;
  if not exists (select 1 from pg_constraint where conname='kataru_profiles_avatar_url_length_check' and conrelid='public.kataru_profiles'::regclass) then
    alter table public.kataru_profiles add constraint kataru_profiles_avatar_url_length_check check (avatar_url is null or char_length(avatar_url) <= 500);
  end if;
end $$;

update public.kataru_profiles profile
set display_name = coalesce(
      nullif(btrim(profile.display_name), ''),
      nullif(btrim(user_row.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(user_row.raw_user_meta_data ->> 'name'), ''),
      profile.username
    ),
    avatar_url = coalesce(
      nullif(btrim(profile.avatar_url), ''),
      nullif(btrim(user_row.raw_user_meta_data ->> 'avatar_url'), ''),
      nullif(btrim(user_row.raw_user_meta_data ->> 'picture'), '')
    ),
    updated_at = now()
from auth.users user_row
where user_row.id = profile.user_id;

insert into public.kataru_profiles (user_id, username, display_name, bio, avatar_url)
select
  user_row.id,
  case
    when coalesce(nullif(btrim(user_row.raw_user_meta_data ->> 'username'), ''), '') ~ '^[A-Za-z0-9_]{3,20}$'
      and not exists (
        select 1 from public.kataru_profiles existing
        where lower(existing.username) = lower(btrim(user_row.raw_user_meta_data ->> 'username'))
      )
    then btrim(user_row.raw_user_meta_data ->> 'username')
    else 'kataru_' || left(replace(user_row.id::text, '-', ''), 8)
  end,
  coalesce(nullif(btrim(user_row.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(user_row.raw_user_meta_data ->> 'name'), ''), 'Usuário Kataru'),
  '',
  coalesce(nullif(btrim(user_row.raw_user_meta_data ->> 'avatar_url'), ''), nullif(btrim(user_row.raw_user_meta_data ->> 'picture'), ''))
from auth.users user_row
where not exists (select 1 from public.kataru_profiles existing where existing.user_id = user_row.id)
on conflict (user_id) do nothing;

create or replace function public.handle_kataru_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  requested_display_name text;
  requested_avatar text;
begin
  requested_username := nullif(btrim(new.raw_user_meta_data ->> 'username'), '');
  if requested_username is null or requested_username !~ '^[A-Za-z0-9_]{3,20}$' then
    requested_username := 'kataru_' || left(replace(new.id::text, '-', ''), 8);
  end if;
  requested_display_name := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), requested_username);
  requested_avatar := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), ''), nullif(btrim(new.raw_user_meta_data ->> 'picture'), ''));

  insert into public.kataru_profiles (user_id, username, display_name, bio, avatar_url)
  values (new.id, requested_username, requested_display_name, '', requested_avatar)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_kataru_new_auth_user() from public, anon, authenticated;
grant execute on function public.handle_kataru_new_auth_user() to service_role;
drop trigger if exists on_kataru_auth_user_created on auth.users;
create trigger on_kataru_auth_user_created after insert on auth.users
for each row execute function public.handle_kataru_new_auth_user();

drop policy if exists "Users can read their own Kataru profile" on public.kataru_profiles;
drop policy if exists "Authenticated users can discover Kataru profiles" on public.kataru_profiles;
create policy "Authenticated users can discover Kataru profiles"
  on public.kataru_profiles for select to authenticated using (true);
drop policy if exists "Users can update their own Kataru profile" on public.kataru_profiles;
create policy "Users can update their own Kataru profile"
  on public.kataru_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists public.kataru_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followed_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint kataru_follows_no_self_follow check (follower_id <> followed_id),
  primary key (follower_id, followed_id)
);
create index if not exists kataru_follows_followed_created_idx
  on public.kataru_follows (followed_id, created_at desc);
alter table public.kataru_follows enable row level security;

drop policy if exists "Authenticated users can read follow relationships" on public.kataru_follows;
create policy "Authenticated users can read follow relationships"
  on public.kataru_follows for select to authenticated using (true);
drop policy if exists "Users can follow from their own account" on public.kataru_follows;
create policy "Users can follow from their own account"
  on public.kataru_follows for insert to authenticated
  with check ((select auth.uid()) = follower_id and follower_id <> followed_id);
drop policy if exists "Users can unfollow from their own account" on public.kataru_follows;
create policy "Users can unfollow from their own account"
  on public.kataru_follows for delete to authenticated
  using ((select auth.uid()) = follower_id);

-- Sanitized projection for social profiles. Private notes and personal dates stay out.
create table if not exists public.kataru_public_anime (
  owner_id uuid not null references auth.users(id) on delete cascade,
  mal_id bigint not null,
  id text not null,
  title text not null,
  title_english text,
  title_aliases text[] not null default '{}',
  display_title text,
  image_url text,
  synopsis text,
  episodes_total integer,
  episodes_total_manual integer,
  episodes_available integer,
  airing_status text,
  release_date date,
  end_date date,
  related_anime jsonb not null default '[]'::jsonb,
  year integer,
  season text,
  format text,
  genres text[] not null default '{}',
  studios text[] not null default '{}',
  score_external numeric,
  status text not null,
  episode_current integer not null default 0,
  rating_personal numeric,
  rewatch_count integer not null default 0,
  is_manual boolean not null default false,
  api_synced_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (owner_id, mal_id)
);
create index if not exists kataru_public_anime_owner_created_idx
  on public.kataru_public_anime (owner_id, created_at desc);
alter table public.kataru_public_anime enable row level security;

drop policy if exists "Owners and followers can read shared anime" on public.kataru_public_anime;
create policy "Owners and followers can read shared anime"
  on public.kataru_public_anime for select to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.kataru_follows follow_row
      where follow_row.follower_id = (select auth.uid())
        and follow_row.followed_id = owner_id
    )
  );

create or replace function public.sync_kataru_public_anime()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'DELETE' then
    delete from public.kataru_public_anime where owner_id = old.owner_id and mal_id = old.mal_id;
    return old;
  end if;
  insert into public.kataru_public_anime (
    owner_id, mal_id, id, title, title_english, title_aliases, display_title,
    image_url, synopsis, episodes_total, episodes_total_manual, episodes_available,
    airing_status, release_date, end_date, related_anime, year, season, format,
    genres, studios, score_external, status, episode_current, rating_personal,
    rewatch_count, is_manual, api_synced_at, updated_at, created_at
  ) values (
    new.owner_id, new.mal_id, new.id, new.title, new.title_english, new.title_aliases,
    new.display_title, new.image_url, new.synopsis, new.episodes_total,
    new.episodes_total_manual, new.episodes_available, new.airing_status,
    new.release_date, new.end_date, new.related_anime, new.year, new.season,
    new.format, new.genres, new.studios, new.score_external, new.status,
    new.episode_current, new.rating_personal, new.rewatch_count, new.is_manual,
    new.api_synced_at, new.updated_at, new.created_at
  )
  on conflict (owner_id, mal_id) do update set
    id=excluded.id, title=excluded.title, title_english=excluded.title_english,
    title_aliases=excluded.title_aliases, display_title=excluded.display_title,
    image_url=excluded.image_url, synopsis=excluded.synopsis,
    episodes_total=excluded.episodes_total, episodes_total_manual=excluded.episodes_total_manual,
    episodes_available=excluded.episodes_available, airing_status=excluded.airing_status,
    release_date=excluded.release_date, end_date=excluded.end_date,
    related_anime=excluded.related_anime, year=excluded.year, season=excluded.season,
    format=excluded.format, genres=excluded.genres, studios=excluded.studios,
    score_external=excluded.score_external, status=excluded.status,
    episode_current=excluded.episode_current, rating_personal=excluded.rating_personal,
    rewatch_count=excluded.rewatch_count, is_manual=excluded.is_manual,
    api_synced_at=excluded.api_synced_at, updated_at=excluded.updated_at,
    created_at=excluded.created_at;
  return new;
end;
$$;
revoke all on function public.sync_kataru_public_anime() from public, anon, authenticated;

drop trigger if exists sync_kataru_public_anime_after_change on public.anime_collection;
create trigger sync_kataru_public_anime_after_change
  after insert or update or delete on public.anime_collection
  for each row execute function public.sync_kataru_public_anime();

insert into public.kataru_public_anime (
  owner_id, mal_id, id, title, title_english, title_aliases, display_title,
  image_url, synopsis, episodes_total, episodes_total_manual, episodes_available,
  airing_status, release_date, end_date, related_anime, year, season, format,
  genres, studios, score_external, status, episode_current, rating_personal,
  rewatch_count, is_manual, api_synced_at, updated_at, created_at
)
select owner_id, mal_id, id, title, title_english, title_aliases, display_title,
  image_url, synopsis, episodes_total, episodes_total_manual, episodes_available,
  airing_status, release_date, end_date, related_anime, year, season, format,
  genres, studios, score_external, status, episode_current, rating_personal,
  rewatch_count, is_manual, api_synced_at, updated_at, created_at
from public.anime_collection
on conflict (owner_id, mal_id) do update set
  id=excluded.id, title=excluded.title, title_english=excluded.title_english,
  title_aliases=excluded.title_aliases, display_title=excluded.display_title,
  image_url=excluded.image_url, synopsis=excluded.synopsis,
  episodes_total=excluded.episodes_total, episodes_total_manual=excluded.episodes_total_manual,
  episodes_available=excluded.episodes_available, airing_status=excluded.airing_status,
  release_date=excluded.release_date, end_date=excluded.end_date,
  related_anime=excluded.related_anime, year=excluded.year, season=excluded.season,
  format=excluded.format, genres=excluded.genres, studios=excluded.studios,
  score_external=excluded.score_external, status=excluded.status,
  episode_current=excluded.episode_current, rating_personal=excluded.rating_personal,
  rewatch_count=excluded.rewatch_count, is_manual=excluded.is_manual,
  api_synced_at=excluded.api_synced_at, updated_at=excluded.updated_at,
  created_at=excluded.created_at;

drop policy if exists "Users can read their own anime lists" on public.anime_lists;
drop policy if exists "Owners and followers can read shared anime lists" on public.anime_lists;
create policy "Owners and followers can read shared anime lists"
  on public.anime_lists for select to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.kataru_follows follow_row
      where follow_row.follower_id = (select auth.uid())
        and follow_row.followed_id = owner_id
    )
  );

create or replace view public.kataru_shared_anime
with (security_invoker = true, security_barrier = true)
as
select
  owner_id, id, mal_id, title, title_english, title_aliases, display_title,
  image_url, synopsis, episodes_total, episodes_total_manual, episodes_available,
  airing_status, release_date, end_date, related_anime, year, season, format,
  genres, studios, score_external, status, episode_current, rating_personal,
  rewatch_count, is_manual, api_synced_at, updated_at, created_at
from public.kataru_public_anime;

create or replace view public.kataru_shared_lists
with (security_invoker = true, security_barrier = true)
as
select owner_id, id, name, description, is_ranked, anime_ids, created_at, updated_at
from public.anime_lists;

-- Remove default broad grants and allow only the precise social operations.
revoke all privileges on table public.kataru_profiles from public, anon, authenticated;
revoke update (username, display_name, bio, avatar_url, updated_at)
  on table public.kataru_profiles from authenticated;
grant select on table public.kataru_profiles to authenticated;
grant update (display_name, bio, updated_at)
  on table public.kataru_profiles to authenticated;

revoke all privileges on table public.kataru_follows from public, anon, authenticated;
grant select, insert, delete on table public.kataru_follows to authenticated;

revoke all privileges on table public.kataru_public_anime from public, anon, authenticated;
grant select on table public.kataru_public_anime to authenticated;

revoke all privileges on table public.kataru_shared_anime from public, anon, authenticated;
revoke all privileges on table public.kataru_shared_lists from public, anon, authenticated;
grant select on table public.kataru_shared_anime, public.kataru_shared_lists to authenticated;

comment on view public.kataru_shared_anime is
  'Security-invoker view over a sanitized projection; RLS requires owner or active follow. Excludes private notes and personal dates.';
comment on view public.kataru_shared_lists is
  'Security-invoker view; underlying RLS requires owner or active follow.';

notify pgrst, 'reload schema';
commit;
