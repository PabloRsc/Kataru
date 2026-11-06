-- Kataru: corrigir e completar o esquema de coleção para o frontend atual.
-- Faça um backup antes de executar este script no projeto Supabase usado pelo app.
-- O script é idempotente: pode ser executado novamente sem duplicar colunas.

alter table public.anime_collection
  add column if not exists display_title text,
  add column if not exists episodes_total_manual integer,
  add column if not exists episodes_available integer,
  add column if not exists format text,
  add column if not exists studios text[] not null default '{}',
  add column if not exists rewatch_count integer not null default 0,
  add column if not exists started_at date,
  add column if not exists completed_at date,
  add column if not exists is_manual boolean not null default false;

alter table public.anime_collection
  drop constraint if exists anime_collection_status_check;
alter table public.anime_collection
  add constraint anime_collection_status_check
  check (status in ('watching','completed','planned','paused','dropped'));

create unique index if not exists anime_collection_owner_mal_id_key
  on public.anime_collection(owner_id, mal_id);
create index if not exists anime_collection_owner_created_idx
  on public.anime_collection(owner_id, created_at desc);

create table if not exists public.anime_lists (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  description text,
  is_ranked boolean not null default false,
  anime_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.anime_lists add column if not exists is_ranked boolean not null default false;
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

-- PostgREST precisa recarregar o cache após as alterações de coluna.
notify pgrst, 'reload schema';
