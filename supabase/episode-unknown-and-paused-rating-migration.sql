-- Kataru: unknown episode state for paused/dropped anime.
-- Safe for existing installations; existing episode_current values are preserved.

begin;

alter table public.anime_collection
  add column if not exists episode_unknown boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'anime_collection_episode_unknown_status_check'
      and conrelid = 'public.anime_collection'::regclass
  ) then
    alter table public.anime_collection
      add constraint anime_collection_episode_unknown_status_check
      check (not episode_unknown or status in ('paused', 'dropped'));
  end if;
end $$;

-- A paused title no longer carries a personal rating. The current connected
-- project has no paused ratings, but this cleans up data from older builds.
update public.anime_collection
set rating_personal = null,
    updated_at = now()
where status = 'paused'
  and rating_personal is not null;

notify pgrst, 'reload schema';
commit;
