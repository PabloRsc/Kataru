# Kataru

Gerenciador pessoal de animes com coleções privadas por usuário, interface em português, catálogo consultado pela [Jikan API](https://docs.api.jikan.moe/) (com fallback AniList nas funções serverless) e persistência local ou Supabase.

## Interface

A navegação está organizada em quatro áreas:

- **Início:** anime em andamento, progresso rápido e prateleiras de títulos assistidos e planejados.
- **Biblioteca:** visualização em grade ou lista, busca, filtros por status, gênero, ano, formato e nota, além de ordenação.
- **Descobrir:** títulos em alta, mais bem avaliados e navegação por gêneros, com capas e inclusão manual na biblioteca. Não inclui calendário de lançamentos.
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
2. Para um banco novo, execute **supabase/schema.sql**. Para um banco já usado por uma versão anterior, faça backup e execute **supabase/redesign-migration.sql**.
3. Execute **supabase/auth-profiles-setup.sql** para criar perfis e a verificação segura de nomes de usuário. Essa configuração já foi aplicada no projeto Supabase conectado ao Kataru.
4. Em Authentication → Providers, habilite Email e configure confirmação de e-mail conforme sua preferência.
5. Em Authentication → URL Configuration, configure Site URL e Redirect URLs para produção, previews e ambiente local.
6. Copie **.env.example** para **.env** e preencha **VITE_SUPABASE_URL** e **VITE_SUPABASE_ANON_KEY**.
7. Reinicie o Vite, crie uma conta na tela do Kataru e entre.

A tela de conta inclui cadastro com nome de usuário único, login por e-mail/senha, opção Google, confirmação de e-mail, recuperação de acesso, troca de senha e controle de sessão persistente ou temporária. Com Supabase configurado, a coleção exige sessão autenticada.

**Google OAuth:** o código já inicia o fluxo, mas é necessário habilitar Google em Authentication → Providers, inserir o OAuth Client ID/Secret do Google Cloud e cadastrar o callback do Supabase no Google Cloud. A URL de retorno do site também deve estar na lista de Redirect URLs do Supabase.

**Recuperação e confirmação:** em Authentication → URL Configuration, autorize o domínio publicado, os previews usados para testes e o endereço local (http://localhost:5173). O link de recuperação retorna à raiz do Kataru para que o Supabase entregue o evento de redefinição de senha.

As páginas **public/termos.html** e **public/privacidade.html** já estão ligadas ao cadastro. Elas são minutas de beta, marcadas como versão de revisão e com campos pendentes (responsável legal, contato, retenção, exclusão, idade mínima, bases legais e transferências internacionais). Não trate esses textos como políticas jurídicas finais nem faça lançamento público definitivo antes de completar e validar essas informações.

### Atualizar uma instalação Supabase existente

Se o banco já está em uso com a versão anterior do Kataru, faça backup e execute **supabase/redesign-migration.sql** e **supabase/auth-profiles-setup.sql** no SQL Editor. As migrações acrescentam os campos de edição e progresso, habilitam o status "Abandonado", criam listas personalizadas e adicionam perfis com nome de usuário único.

Não execute essa migração em um banco vazio como substituto de **schema.sql**; para uma instalação nova, use o schema completo.

### Segurança e migração de dados

- Cada registro possui **owner_id**; políticas RLS limitam leitura, criação, edição e exclusão ao proprietário.
- Nunca coloque a chave **service_role** em variáveis **VITE_*** ou no navegador.
- O script **supabase/auth-profiles-setup.sql** também remove `EXECUTE` público da função administrativa `rls_auto_enable()`; a função pública `is_kataru_username_available()` retorna somente um booleano e é necessária ao cadastro.
- Registros de instalações antigas sem **owner_id** permanecem inacessíveis até serem atribuídos manualmente ao usuário correto. Faça backup antes da migração; não associe registros antigos automaticamente.
- O modo local e o modo Supabase são armazenamentos separados. Importar dados do navegador para a nuvem ainda exige uma ferramenta de importação explícita.
- As listas pessoais são privadas. A opção "Pública" é armazenada para uso futuro, mas não ativa compartilhamento público nesta versão.

## Catálogo

A pesquisa e atualização manual passam por funções serverless da Vercel (/api/anime). A fonte principal é a Jikan API; se ela falhar, o servidor consulta a AniList GraphQL como alternativa. Os dois provedores são normalizados para o formato usado pela coleção. Quando a Jikan não informa episódios de séries em lançamento, o Kataru tenta enriquecer a contagem com a AniList.

A Biblioteca separa a coleção por formato (Séries TV, Filmes, OVAs, ONAs, Especiais e Música) e, por padrão, ordena do lançamento mais antigo ao mais recente. Títulos relacionados são agrupados quando o catálogo informa relações oficiais entre eles ou quando os títulos seguem um padrão reconhecível de temporadas/partes. A ordem usa a data exata quando disponível e o ano como alternativa quando o provedor não informa dia e mês. Ao adicionar um anime, o Kataru busca seus detalhes completos. Para atualizar os títulos que já estavam na biblioteca, use o botão “Atualizar datas e temporadas” na própria Biblioteca; ele consulta os animes da coleção em sequência e preserva o progresso, status, notas e datas pessoais. Também é possível atualizar um título individual pela tela de detalhes.

A área Descobrir consulta títulos populares, mais bem avaliados e gêneros sob demanda. A Jikan é a fonte principal; se uma consulta falhar ou retornar uma lista vazia, a função serverless tenta a AniList GraphQL como alternativa. A categoria de mais bem avaliados também aplica a ordenação por nota na fonte alternativa. Os títulos encontrados permanecem apenas no catálogo externo e só entram em anime_collection quando o usuário escolhe adicioná-los à biblioteca. No desenvolvimento local, o Vite encaminha as rotas de catálogo para a Jikan.

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
- **api/catalog/[...path].js:** rotas serverless do catálogo usadas em Descobrir.
- **server/jikan.js:** cliente Jikan server-side com timeout e retry.
- **server/anilist.js:** fonte alternativa via AniList GraphQL e normalização.
- **vite.config.js:** proxy local para as rotas de catálogo.
- **src/storage.js:** persistência local ou Supabase por usuário.
- **src/styles.css:** identidade visual e layouts responsivos.
- **supabase/schema.sql:** schema completo para novas instalações.
- **supabase/redesign-migration.sql:** migração de bancos existentes para os campos e listas do redesign.
