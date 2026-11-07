# Kataru — status do projeto

Última atualização: 2026-11-06

## Direção do produto

Aplicativo de coleção pessoal de animes com contas individuais. Cada usuário deve acessar somente sua própria coleção, notas, progresso e observações. Interface em português.

## Redesign da interface

A estrutura foi reorganizada de acordo com os mockups enviados:

- Navegação principal: Início, Biblioteca, Descobrir e Listas.
- Início com anime em andamento, ação rápida de episódio e prateleiras Assistindo, Assistidos recentemente e Quero assistir.
- Biblioteca em grade/lista, busca, status, filtros por gênero/ano/formato/nota e ordenação.
- Descobrir com temporada atual, populares, próximos lançamentos e gêneros.
- Detalhes com status, progresso, avaliação por estrelas, anotações, datas, reassistidas e metadados.
- Fluxos de adição/edição e adição manual de título.
- Listas automáticas por status e listas personalizadas.
- Navegação inferior em dispositivos móveis.
- Calendário de lançamentos não faz parte desta versão.

## Implementado no repositório (branch de redesign)

- Aplicação React + Vite.
- Pesquisa e detalhes de catálogo via funções serverless da Vercel, Jikan como fonte principal e AniList como fallback.
- Endpoint serverless para temporada atual, próximos lançamentos, populares e gêneros na área Descobrir, com Jikan como fonte principal e fallback AniList em caso de falha.
- Página de Descobrir com categorias explicadas, consulta por gênero e inclusão explícita dos títulos na biblioteca.
- Biblioteca com filtros, ordenação e alternância grade/lista.
- Progresso de episódios, status, nota, datas, reassistidas, título de exibição, total manual e anotações.
- Listas automáticas por status e listas personalizadas.
- Persistência local e métodos Supabase com isolamento por owner_id.
- Migração SQL para instalações existentes e schema atualizado para novas instalações.
- Interface responsiva com barra inferior mobile.

## Autenticação e configuração

- Cliente Supabase com sessão persistente.
- Tela de autenticação por e-mail: cadastro, login e solicitação de redefinição de senha.
- Controle de sessão na entrada do app e ação para sair.
- Armazenamento Supabase filtrado por owner_id.
- Execute supabase/schema.sql em novas instalações.
- Para bancos existentes, faça backup e execute supabase/redesign-migration.sql.
- Testar cadastro, confirmação de e-mail, login, sessão, logout e isolamento entre duas contas.

## Cuidados de migração

- Registros antigos sem owner_id permanecem inacessíveis a usuários autenticados até serem atribuídos manualmente ao dono correto. Fazer backup e não associar registros automaticamente.
- Dados em localStorage não são migrados automaticamente para Supabase.
- Nunca usar service_role no frontend.
- A opção de lista "Pública" é apenas armazenada; compartilhamento público não foi implementado.

## Validação pendente

1. Executar npm install e npm run build no ambiente do projeto.
2. Aplicar o schema/migração no Supabase de destino e testar criação, edição e exclusão de listas.
3. Testar fluxos de autenticação e políticas RLS com duas contas reais.
4. Testar busca, descoberta, detalhes e gravação de progresso no deploy.
5. Revisar acessibilidade e comportamento visual em larguras variadas.
6. Atualização automática de metadados e importação de coleção local continuam fora do escopo implementado.

## Arquivos centrais

- src/App.jsx — navegação e telas.
- src/AuthGate.jsx — autenticação e controle de sessão.
- src/storage.js — persistência local/Supabase.
- src/api.js — cliente da API de catálogo e descoberta.
- api/anime/ — endpoints serverless de pesquisa e detalhes.
- server/jikan.js — Jikan com timeout e retry limitado.
- server/anilist.js — fallback AniList e normalização.
- vite.config.js — proxy local das rotas de catálogo.
- src/styles.css — interface responsiva.
- supabase/schema.sql — schema e RLS para novas instalações.
- supabase/redesign-migration.sql — migração para instalações existentes.
