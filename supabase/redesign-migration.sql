-- Kataru UI redesign: campos de coleção e listas personalizadas.
-- Execute no Supabase SQL Editor após atualizar o frontend. Faça backup antes de aplicar.

alter table public.anime_collection
  add column if not exists display_title text,
  add column if not exists episodes_total_manual integer,
  add column if not exists format text,
  add column if not exists studios text[] not null default '{}',
  add column if not exists rewatch_count integer not null default 0,
  add column if not exists started_at date,
  add column if not exists completed_at date,
  add column if not exists is_manual boolean not null default false;

-- Os novos status correspondem às opções apresentadas no mockup.
alter table public.anime_collection
  drop constraint if exists anime_collection_status_check;
alter table public.anime_collection
  add constraint anime_collection_status_check
  check (status in ('watching','completed','planned','paused','dropped'));

create table if not exists public.anime_lists (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  description text,
  is_public boolean not null default false,
  is_ranked boolean not null default false,
  anime_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.anime_lists add column if not exists is_ranked boolean not null default false;

create unique index if not exists anime_lists_owner_id_key
  on public.anime_lists(owner_id, id);
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

-- As listas são privadas por padrão. "is_public" apenas guarda a preferência
-- para uma futura experiência de compartilhamento; não habilita leitura anônima.
