# Kataru

Gerenciador pessoal de animes com coleções privadas por usuário, interface em português, catálogo consultado pela [Jikan API](https://docs.api.jikan.moe/) e persistência local ou Supabase.

## Requisitos

- Node.js 20 ou superior
- npm
- Projeto Supabase para habilitar contas e sincronização na nuvem

## Executar localmente

```bash
npm install
npm run dev
```

Sem variáveis Supabase, o app permanece em modo local para desenvolvimento. Os dados ficam apenas no navegador/dispositivo e não são sincronizados entre dispositivos.

## Configurar contas e sincronização

1. Crie um projeto no [Supabase](https://supabase.com).
2. No SQL Editor, revise e execute `supabase/schema.sql`. O script cria políticas RLS por usuário.
3. Em Authentication → Providers, habilite Email e configure confirmação de e-mail conforme sua preferência.
4. Em Authentication → URL Configuration, configure Site URL e Redirect URLs para os ambientes local e publicado.
5. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
6. Reinicie o Vite, crie uma conta na tela do Kataru e entre.

A tela de conta inclui cadastro, login, redefinição de senha e saída. Com Supabase configurado, a coleção exige sessão autenticada.

### Segurança e migração

- Cada registro possui `owner_id`; políticas RLS limitam leitura, criação, edição e exclusão ao proprietário.
- Nunca coloque a chave `service_role` em variáveis `VITE_*` ou no navegador.
- Registros de instalações antigas sem `owner_id` permanecem inacessíveis até serem atribuídos manualmente ao usuário correto. Faça backup antes da migração; não associe registros antigos automaticamente.
- O modo local e o modo Supabase são armazenamentos separados. Importar dados do navegador para a nuvem ainda exige uma ferramenta de importação explícita.

## Catálogo

A pesquisa e atualização manual passam por funções serverless da Vercel (`/api/anime`). O servidor consulta a Jikan API, uma API não oficial para dados do MyAnimeList, com timeout, uma nova tentativa em falhas temporárias e cache HTTP (5 minutos para pesquisas e 1 hora para detalhes). No desenvolvimento local, o Vite encaminha `/api/anime` para a Jikan. A Jikan continua sendo uma dependência externa e pode ficar indisponível; nesse caso o app mostra uma mensagem amigável.

## Próximas melhorias

- Importação da coleção local para a conta autenticada.
- Melhorias de interface e acessibilidade.
- Testes de build e autenticação com projeto Supabase configurado.
- Atualização automática de metadados (ainda não implementada).

## Build

```bash
npm run build
npm run preview
```

## Estrutura

- `src/App.jsx`: interface, coleção, pesquisa e edição.
- `src/AuthGate.jsx`: cadastro, login, redefinição de senha e sessão.
- `src/api.js`: cliente do catálogo via API própria.
- `api/anime/`: funções serverless para pesquisa e detalhes.
- `server/jikan.js`: cliente server-side com timeout e retry.
- `vite.config.js`: proxy local para as rotas de catálogo.
- `src/storage.js`: persistência local ou Supabase por usuário.
- `src/styles.css`: estilos.
- `supabase/schema.sql`: esquema e políticas RLS.
