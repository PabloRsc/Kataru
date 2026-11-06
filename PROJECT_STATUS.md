# Kataru — status do projeto

Última atualização: 2026-11-06

## Direção do produto

Aplicativo de coleção pessoal de animes com contas individuais. Cada usuário deve acessar somente sua própria coleção, notas, progresso e observações. Interface em português.

## Implementado no repositório

- Aplicação React + Vite.
- Pesquisa de catálogo via funções serverless da Vercel, com timeout, retry e cache; Jikan permanece como fonte externa.
- Cadastro, edição, exclusão, filtros e detalhes da coleção.
- Persistência local via localStorage quando o Supabase não está configurado.
- Cliente Supabase com sessão persistente.
- Tela de autenticação por e-mail: cadastro, login e solicitação de redefinição de senha.
- Controle de sessão na entrada do app e ação para sair.
- Armazenamento Supabase filtrado por owner_id.
- Esquema SQL com owner_id, índice único por proprietário + mal_id e políticas RLS individuais.
- README, .gitignore e .env.example.

## Configuração necessária antes de usar contas reais

1. Criar projeto Supabase.
2. Revisar e executar supabase/schema.sql.
3. Habilitar o provedor Email e configurar URLs de redirecionamento no Supabase Auth.
4. Definir VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ambiente local/deploy.
5. Testar cadastro, confirmação de e-mail, login, sessão, logout e isolamento entre duas contas.

## Cuidados de migração

- O schema anterior tinha mal_id único global e não tinha owner_id. O SQL novo remove a constraint global e cria unicidade por owner_id + mal_id.
- Registros antigos ficam com owner_id nulo e não aparecem para usuários autenticados. Fazer backup e atribuir manualmente cada registro ao dono correto antes de qualquer migração.
- Dados em localStorage não são migrados automaticamente para Supabase.
- Nunca usar service_role no frontend.

## Pendências prioritárias

1. Confirmar deploy da nova API de catálogo na Vercel e testar `/api/anime/search?q=one%20piece`.
2. Executar npm install e npm run build.
3. Testar fluxos de autenticação e políticas RLS com duas contas reais.
4. Completar/verificar o fluxo de redefinição de senha após retorno do e-mail.
5. Implementar importação opcional de coleção local para conta autenticada.
6. Revisar tratamento de erros em exclusão e sincronização.
7. Melhorar estados visuais de carregamento, erros e acessibilidade.
8. Planejar rotina de atualização automática de metadados; ainda não implementada.

## Arquivos centrais

- src/App.jsx — interface principal.
- src/AuthGate.jsx — autenticação e controle de sessão.
- src/storage.js — persistência local/Supabase.
- src/api.js — cliente da API própria de catálogo.
- api/anime/ — endpoints serverless de pesquisa e detalhes.
- server/jikan.js — integração server-side com Jikan, timeout e retry.
- vite.config.js — proxy local das rotas de catálogo.
- api/anime/ — endpoints serverless de pesquisa e detalhes.
- server/jikan.js — integração server-side com Jikan, timeout e retry.
- vite.config.js — proxy local das rotas de catálogo.
- src/styles.css — interface.
- supabase/schema.sql — banco e RLS.

## Verificação

As alterações foram publicadas diretamente na branch main do GitHub. A nova arquitetura de catálogo ainda precisa ser validada pelo próximo deploy da Vercel; build e testes automatizados não foram executados neste ambiente.
