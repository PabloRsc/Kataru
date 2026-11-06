-- Kataru: coleção pessoal e listas privadas por usuário.
-- Execute no SQL Editor do Supabase. Faça backup antes de aplicar em um banco existente.

create table if not exists public.anime_collection (
  id text primary key,
  owner_id uuid references auth.users(id) on delete cascade,
  mal_id bigint not null,
  title text not null,
  title_english text,
  display_title text,
  image_url text,
  synopsis text,
  episodes_total integer,
  episodes_total_manual integer,
  year integer,
  season text,
  format text,
  genres text[] not null default '{}',
  score_external numeric,
  status text not null default 'planned'
    check (status in ('watching','completed','planned','paused','dropped')),
  episode_current integer not null default 0 check (episode_current >= 0),
  rating_personal numeric check (rating_personal is null or (rating_personal >= 0 and rating_personal <= 10)),
  notes text,
  rewatch_count integer not null default 0,
  started_at date,
  completed_at date,
  is_manual boolean not null default false,
  api_synced_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Migração idempotente para versões anteriores da tabela:
alter table public.anime_collection add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.anime_collection add column if not exists display_title text;
alter table public.anime_collection add column if not exists episodes_total_manual integer;
alter table public.anime_collection add column if not exists format text;
alter table public.anime_collection add column if not exists rewatch_count integer not null default 0;
alter table public.anime_collection add column if not exists started_at date;
alter table public.anime_collection add column if not exists completed_at date;
alter table public.anime_collection add column if not exists is_manual boolean not null default false;

alter table public.anime_collection drop constraint if exists anime_collection_mal_id_key;
alter table public.anime_collection drop constraint if exists anime_collection_status_check;
alter table public.anime_collection add constraint anime_collection_status_check
  check (status in ('watching','completed','planned','paused','dropped'));

create unique index if not exists anime_collection_owner_mal_id_key
  on public.anime_collection(owner_id, mal_id);
create index if not exists anime_collection_owner_created_idx
  on public.anime_collection(owner_id, created_at desc);

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

create table if not exists public.anime_lists (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  description text,
  is_public boolean not null default false,
  anime_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists anime_lists_owner_updated_idx
  on public.anime_lists(owner_id, updated_at desc);

alter table public.anime_lists enable row level security;

drop policy if exists "Users can read their own anime lists" on public.anime_lists;
drop policy if exists "Users can insert their own anime lists" on public.anime_lists;
drop policy if exists "Users can update their own anime lists" on public.anime_lists;
drop policy if exists "Users can delete their own anime lists" on public.anime_lists;

create policy "Users can read their own anime lists" on public.anime_lists
  for select to authenticated using (auth.uid() = owner_id);
create policy "Users can insert their own anime lists" on public.anime_lists
  for insert to authenticated with check (auth.uid() = owner_id);
create policy "Users can update their own anime lists" on public.anime_lists
  for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Users can delete their own anime lists" on public.anime_lists
  for delete to authenticated using (auth.uid() = owner_id);

-- Registros antigos sem owner_id permanecem inacessíveis até serem atribuídos
-- manualmente ao usuário correto. Não os associe automaticamente a uma conta.
-- "is_public" guarda a preferência; não habilita leitura anônima nesta versão.
