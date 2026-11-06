# AnimeLog

Gerenciador pessoal de animes com interface inspirada no Letterboxd, catálogo consultado pela [Jikan API](https://docs.api.jikan.moe/) e armazenamento local ou Supabase.

## Requisitos

- Node.js 20 ou superior
- npm

## Executar localmente

```bash
npm install
npm run dev
```

Abra o endereço informado pelo Vite (normalmente http://localhost:5173).

Sem credenciais Supabase, a aplicação usa o `localStorage`. Os dados ficam apenas no navegador e dispositivo atuais; não há sincronização entre dispositivos.

## Configuração do Supabase

O suporte ao Supabase existe no código, mas **não considere a persistência em nuvem pronta para produção**. A tabela habilita RLS e ainda precisa de autenticação, identificação do proprietário dos registros e políticas de acesso compatíveis com o modelo de usuário.

1. Crie um projeto no [Supabase](https://supabase.com).
2. Revise e execute `supabase/schema.sql` no SQL Editor.
3. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
4. Implemente autenticação e políticas RLS por usuário antes de inserir dados pessoais ou publicar a aplicação.
5. Reinicie o servidor Vite.

Nunca coloque uma chave `service_role` em variáveis `VITE_*` ou no código do navegador. O arquivo `.env` é ignorado pelo Git; compartilhe apenas o modelo sem credenciais em `.env.example`.

## Catálogo

A pesquisa e a atualização manual consultam a Jikan API, uma API não oficial para dados do MyAnimeList. Há limites de requisição e o serviço pode ficar indisponível. O aplicativo não mantém uma base própria de catálogo.

## Atualização automática

A aplicação oferece atualização manual por título. A rotina semanal descrita no planejamento ainda **não está implementada**. Antes de criá-la, será necessário concluir autenticação e políticas de acesso no Supabase. A rotina deverá atualizar somente metadados do catálogo, preservando status, episódio atual, nota pessoal e observações.

## Build de produção

```bash
npm run build
npm run preview
```

## Estrutura principal

- `src/App.jsx`: interface, coleção, pesquisa e edição.
- `src/api.js`: integração e normalização dos dados da Jikan.
- `src/storage.js`: persistência local ou Supabase.
- `src/styles.css`: estilos da aplicação.
- `supabase/schema.sql`: esquema inicial do banco.
