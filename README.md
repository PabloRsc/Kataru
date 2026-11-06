# Kataru

Gerenciador pessoal de animes com coleções privadas por usuário, interface em português, catálogo consultado pela [Jikan API](https://docs.api.jikan.moe/) (com fallback AniList nas funções serverless) e persistência local ou Supabase.

## Interface

A navegação está organizada em quatro áreas:

- **Início:** anime em andamento, progresso rápido e prateleiras de títulos assistidos e planejados.
- **Biblioteca:** visualização em grade ou lista, busca, filtros por status, gênero, ano, formato e nota, além de ordenação.
- **Descobrir:** temporada atual, títulos populares, próximos lançamentos e navegação por gêneros. Não inclui calendário de lançamentos.
- **Listas:** listas automáticas por status e listas temáticas criadas pelo usuário.

Os detalhes de cada anime incluem status, progresso por episódio, avaliação pessoal por estrelas, anotações, datas, reassistidas e informações do catálogo. A edição permite ajustar título exibido e total de episódios manualmente, além de adicionar um título sem catálogo.

A interface é responsiva: no mobile, a navegação principal passa para uma barra inferior.

## Requisitos

- Node.js 20 ou superior
- npm
- Projeto Supabase para habilitar contas e sincronização na nuvem

## Executar localmente

~~~bash
npm install
npm run dev
~~~

Sem variáveis Supabase, o app permanece em modo local para desenvolvimento. Os dados ficam apenas no navegador/dispositivo e não são sincronizados entre dispositivos.

## Configurar contas e sincronização

1. Crie um projeto no [Supabase](https://supabase.com).
2. No SQL Editor, revise e execute **supabase/schema.sql**. O script cria as tabelas e políticas RLS por usuário.
3. Em Authentication → Providers, habilite Email e configure confirmação de e-mail conforme sua preferência.
4. Em Authentication → URL Configuration, configure Site URL e Redirect URLs para os ambientes local e publicado.
5. Copie **.env.example** para **.env** e preencha **VITE_SUPABASE_URL** e **VITE_SUPABASE_ANON_KEY**.
6. Reinicie o Vite, crie uma conta na tela do Kataru e entre.

A tela de conta inclui cadastro, login, redefinição de senha e saída. Com Supabase configurado, a coleção exige sessão autenticada.

### Atualizar uma instalação Supabase existente

Se o banco já está em uso com a versão anterior do Kataru, faça backup e execute **supabase/redesign-migration.sql** no SQL Editor. Essa migração acrescenta os campos de edição e progresso, habilita o status "Abandonado" e cria a tabela de listas personalizadas com políticas RLS.

Não execute essa migração em um banco vazio como substituto de **schema.sql**; para uma instalação nova, use o schema completo.

### Segurança e migração de dados

- Cada registro possui **owner_id**; políticas RLS limitam leitura, criação, edição e exclusão ao proprietário.
- Nunca coloque a chave **service_role** em variáveis **VITE_*** ou no navegador.
- Registros de instalações antigas sem **owner_id** permanecem inacessíveis até serem atribuídos manualmente ao usuário correto. Faça backup antes da migração; não associe registros antigos automaticamente.
- O modo local e o modo Supabase são armazenamentos separados. Importar dados do navegador para a nuvem ainda exige uma ferramenta de importação explícita.
- As listas pessoais são privadas. A opção "Pública" é armazenada para uso futuro, mas não ativa compartilhamento público nesta versão.

## Catálogo

A pesquisa e atualização manual passam por funções serverless da Vercel (/api/anime). A fonte principal é a Jikan API; se ela falhar, o servidor consulta a AniList GraphQL como alternativa. Os dois provedores são normalizados para o formato usado pela coleção. Quando a Jikan não informa episódios de séries em lançamento, o Kataru tenta enriquecer a contagem com a AniList.

A área Descobrir usa endpoints da Jikan para temporada atual, próximos lançamentos, títulos populares e gêneros. No desenvolvimento local, o Vite encaminha as rotas de catálogo e descoberta para a Jikan. A alternativa AniList é executada nas funções serverless da Vercel.

## Build

~~~bash
npm run build
npm run preview
~~~

## Estrutura

- **src/App.jsx:** navegação, páginas, pesquisa, detalhes, biblioteca, listas e edição.
- **src/AuthGate.jsx:** cadastro, login, redefinição de senha e sessão.
- **src/api.js:** cliente do catálogo e descoberta.
- **api/anime/:** funções serverless para pesquisa e detalhes.
- **server/jikan.js:** cliente Jikan server-side com timeout e retry.
- **server/anilist.js:** fonte alternativa via AniList GraphQL e normalização.
- **vite.config.js:** proxy local para as rotas de catálogo.
- **src/storage.js:** persistência local ou Supabase por usuário.
- **src/styles.css:** identidade visual e layouts responsivos.
- **supabase/schema.sql:** schema completo para novas instalações.
- **supabase/redesign-migration.sql:** migração de bancos existentes para os campos e listas do redesign.
