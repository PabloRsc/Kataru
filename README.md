# AnimeLog

Gerenciador pessoal de animes, com interface inspirada no Letterboxd, catálogo consultado pela Jikan API e armazenamento local ou Supabase.

## Requisitos
- Node.js 20 ou superior
- npm

## Executar localmente
```bash
npm install
npm run dev
```
Abra o endereço informado pelo Vite (normalmente http://localhost:5173).

Na primeira execução, sem credenciais Supabase, os dados ficam salvos no `localStorage` do navegador. Isso permite testar cadastro, edição e exclusão imediatamente, mas os dados ficam apenas naquele navegador/dispositivo.

## Supabase (opcional nesta primeira etapa)
1. Crie um projeto em https://supabase.com.
2. Execute `supabase/schema.sql` no SQL Editor.
3. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
4. Configure autenticação e políticas RLS antes de publicar com dados pessoais. O esquema fornecido habilita RLS intencionalmente e não abre acesso público.
5. Reinicie o servidor Vite.

## Catálogo
A pesquisa usa a Jikan API (MyAnimeList não oficial): https://docs.api.jikan.moe/ . A API tem limites de requisição e pode ficar indisponível. O app não mantém uma base própria de catálogo.

## Atualização automática semanal
A interface já contém atualização manual por título. A rotina semanal deve ser configurada no Supabase Cron/Edge Function depois de conectar e proteger a base com autenticação. A rotina deverá consultar os IDs MyAnimeList armazenados e atualizar apenas os metadados do catálogo, preservando `status`, `episode_current`, `rating_personal` e `notes`. Não configure uma rotina pública antes de definir autenticação e políticas de acesso.

## Build
```bash
npm run build
```
