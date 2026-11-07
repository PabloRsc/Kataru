-- Kataru: completar o esquema existente sem apagar registros atuais.
-- Execute no projeto Supabase conectado ao app; faça backup antes.
-- Idempotente: colunas, índices e tabela podem ser criados se já existirem.

begin;

alter table public.anime_collection
  add column if not exists display_title text,
  add column if not exists title_aliases text[] not null default '{}',
  add column if not exists episodes_total_manual integer,
  add column if not exists episodes_available integer,
  add column if not exists airing_status text,
  add column if not exists format text,
  add column if not exists studios text[] not null default '{}',
  add column if not exists rewatch_count integer not null default 0,
  add column if not exists started_at date,
  add column if not exists completed_at date,
  add column if not exists is_manual boolean not null default false;

-- Impede novas linhas sem proprietário quando os registros existentes permitem isso.
do $$
begin
  if not exists (select 1 from public.anime_collection where owner_id is null) then
    alter table public.anime_collection alter column owner_id set not null;
  end if;
end $$;

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

-- O upsert da aplicação usa onConflict: owner_id,id.
create unique index if not exists anime_lists_owner_id_key
  on public.anime_lists(owner_id, id);
create index if not exists anime_lists_owner_updated_idx
  on public.anime_lists(owner_id, updated_at desc);

alter table public.anime_collection enable row level security;
alter table public.anime_lists enable row level security;

drop policy if exists "Users can read their own anime" on public.anime_collection;
drop policy if exists "Users can insert their own anime" on public.anime_collection;
drop policy if exists "Users can update their own anime" on public.anime_collection;
drop policy if exists "Users can delete their own anime" on public.anime_collection;
create policy "Users can read their own anime" on public.anime_collection
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Users can insert their own anime" on public.anime_collection
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Users can update their own anime" on public.anime_collection
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "Users can delete their own anime" on public.anime_collection
  for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "Users can read their own anime lists" on public.anime_lists;
drop policy if exists "Users can insert their own anime lists" on public.anime_lists;
drop policy if exists "Users can update their own anime lists" on public.anime_lists;
drop policy if exists "Users can delete their own anime lists" on public.anime_lists;
create policy "Users can read their own anime lists" on public.anime_lists
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Users can insert their own anime lists" on public.anime_lists
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Users can update their own anime lists" on public.anime_lists
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "Users can delete their own anime lists" on public.anime_lists
  for delete to authenticated using ((select auth.uid()) = owner_id);

-- Grants expõem as tabelas apenas a usuários autenticados; RLS restringe por proprietário.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.anime_collection, public.anime_lists to authenticated;
revoke all on table public.anime_collection, public.anime_lists from anon;

notify pgrst, 'reload schema';
commit;
