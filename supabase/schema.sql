-- AnimeLog: coleções privadas por usuário.
-- Execute no SQL Editor do Supabase. Faça backup antes de aplicar em um banco existente.

create table if not exists public.anime_collection (
  id text primary key,
  owner_id uuid references auth.users(id) on delete cascade,
  mal_id bigint not null,
  title text not null,
  title_english text,
  image_url text,
  synopsis text,
  episodes_total integer,
  year integer,
  season text,
  genres text[] not null default '{}',
  score_external numeric,
  status text not null default 'planned' check (status in ('watching','completed','planned','paused')),
  episode_current integer not null default 0 check (episode_current >= 0),
  rating_personal numeric check (rating_personal is null or (rating_personal >= 0 and rating_personal <= 10)),
  notes text,
  api_synced_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Migração segura para instalações anteriores à autenticação:
alter table public.anime_collection add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.anime_collection drop constraint if exists anime_collection_mal_id_key;
create unique index if not exists anime_collection_owner_mal_id_key on public.anime_collection(owner_id, mal_id);
create index if not exists anime_collection_owner_created_idx on public.anime_collection(owner_id, created_at desc);

alter table public.anime_collection enable row level security;

drop policy if exists "Users can read their own anime" on public.anime_collection;
drop policy if exists "Users can insert their own anime" on public.anime_collection;
drop policy if exists "Users can update their own anime" on public.anime_collection;
drop policy if exists "Users can delete their own anime" on public.anime_collection;

create policy "Users can read their own anime" on public.anime_collection
  for select to authenticated using (auth.uid() = owner_id);
create policy "Users can insert their own anime" on public.anime_collection
  for insert to authenticated with check (auth.uid() = owner_id);
create policy "Users can update their own anime" on public.anime_collection
  for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Users can delete their own anime" on public.anime_collection
  for delete to authenticated using (auth.uid() = owner_id);

-- Registros antigos sem owner_id permanecem inacessíveis até serem atribuídos
-- manualmente ao usuário correto. Não os associe automaticamente a uma conta.
