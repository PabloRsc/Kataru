-- Expose the owner's personal anime rating to users who can already view
-- their shared library. Episode progress, notes, dates and rewatch counts remain private.

begin;

grant select (rating_personal)
on table public.kataru_public_anime
to authenticated;

create or replace view public.kataru_shared_anime
with (security_invoker = true, security_barrier = true)
as
select
  owner_id, id, mal_id, title, title_english, title_aliases, display_title,
  image_url, synopsis, episodes_total, episodes_total_manual, episodes_available,
  airing_status, release_date, end_date, related_anime, year, season, format,
  genres, studios, score_external, status, is_manual, api_synced_at,
  updated_at, created_at, rating_personal
from public.kataru_public_anime;

revoke all privileges on table public.kataru_shared_anime from public, anon, authenticated;
grant select on table public.kataru_shared_anime to authenticated;

comment on view public.kataru_shared_anime is
  'Security-invoker view: owner or active followers can see catalog metadata, status and the owner''s personal rating. Episode progress, notes, personal dates and rewatch counts remain excluded.';

notify pgrst, 'reload schema';
commit;
