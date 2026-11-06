-- Execute no SQL Editor do Supabase.
create table if not exists public.anime_collection (
  id text primary key,
  mal_id bigint not null unique,
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
  episode_current integer not null default 0,
  rating_personal numeric check (rating_personal is null or (rating_personal >= 0 and rating_personal <= 10)),
  notes text,
  api_synced_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Para uso estritamente pessoal, mantenha RLS habilitado e configure autenticação/policies
-- antes de conectar um site publicado. Não use políticas públicas de escrita em produção.
alter table public.anime_collection enable row level security;

-- Exemplo de policy para um projeto com Supabase Auth:
-- create policy "owner can manage collection" on public.anime_collection
-- for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
-- Nesse caso, adicione owner_id uuid references auth.users(id) antes de criar a policy.
