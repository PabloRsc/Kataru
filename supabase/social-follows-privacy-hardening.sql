-- Kataru social privacy hardening.
-- Keep internal projection data intact, but expose only title/status/catalog fields to followers.
begin;

drop view if exists public.kataru_shared_anime;

revoke all privileges on table public.kataru_public_anime from public, anon, authenticated;
grant select (
  owner_id, mal_id, id, title, title_english, title_aliases, display_title,
  image_url, synopsis, episodes_total, episodes_total_manual, episodes_available,
  airing_status, release_date, end_date, related_anime, year, season, format,
  genres, studios, score_external, status, is_manual, api_synced_at,
  updated_at, created_at
) on table public.kataru_public_anime to authenticated;

create view public.kataru_shared_anime
with (security_invoker = true, security_barrier = true)
as
select
  owner_id, id, mal_id, title, title_english, title_aliases, display_title,
  image_url, synopsis, episodes_total, episodes_total_manual, episodes_available,
  airing_status, release_date, end_date, related_anime, year, season, format,
  genres, studios, score_external, status, is_manual, api_synced_at,
  updated_at, created_at
from public.kataru_public_anime;

revoke all privileges on table public.kataru_shared_anime from public, anon, authenticated;
grant select on table public.kataru_shared_anime to authenticated;

comment on view public.kataru_shared_anime is
  'Security-invoker view over a sanitized projection; RLS requires owner or active follow. Excludes private notes, personal dates, episode progress, personal ratings and rewatch counts.';

notify pgrst, 'reload schema';
commit;
