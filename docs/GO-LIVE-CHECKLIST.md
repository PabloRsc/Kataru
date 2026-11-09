# Kataru — checklist de liberação

Branch de trabalho: `refine/mockup-fidelity`  
PR: [#2 — Refinamento de fidelidade aos mockups](https://github.com/PabloRsc/Kataru/pull/2)  
Supabase: projeto `Kataru` (`doqegxnwclbomyxmgbrb`)  
Preview atual: https://kataru-git-refine-mockup-fidelity-kataru.vercel.app

Este arquivo separa o que já está implementado do que depende de credenciais, escolhas do responsável ou validação externa. A `main` continua sem alterações nesta etapa.

## Implementado nesta etapa

- [x] Criadas as páginas `public/termos.html` e `public/privacidade.html`, com linguagem e dados coerentes com a versão atual do app.
- [x] Os links legais abrem no cadastro e nos rodapés de autenticação e aplicação.
- [x] Os documentos estão marcados como minutas de beta, com pendências visíveis. Não são políticas jurídicas definitivas.
- [x] Revogada a permissão `EXECUTE` de `PUBLIC`, `anon` e `authenticated` para a função administrativa `public.rls_auto_enable()` no Supabase; o resultado foi verificado por consulta de privilégios.
- [x] A mesma proteção foi registrada em `supabase/auth-profiles-setup.sql` para instalações futuras.
- [x] Conferidas as políticas RLS de `anime_collection`, `anime_lists` e `kataru_profiles`: as políticas existentes limitam as operações ao ID do usuário autenticado.

## Ainda depende de configuração externa

### 1. Google OAuth

O fluxo de botão já existe no código, mas a ativação depende de credenciais do projeto Google Cloud.

- [ ] Criar ou selecionar um projeto no Google Cloud e configurar a tela de consentimento.
- [ ] Criar credencial OAuth do tipo **Web application**.
- [ ] Cadastrar as origens JavaScript autorizadas:
  - `https://kataru-git-refine-mockup-fidelity-kataru.vercel.app`
  - adicionar o domínio definitivo quando escolhido;
  - `http://localhost:5173` apenas para desenvolvimento local, se necessário.
- [ ] Cadastrar como URI de redirecionamento autorizada no Google Cloud o callback do Supabase:
  `https://doqegxnwclbomyxmgbrb.supabase.co/auth/v1/callback`
- [ ] Inserir o Client ID e o Client Secret em Supabase → Authentication → Sign In / Providers → Google e habilitar o provedor.
- [ ] Manter apenas os escopos de identidade necessários: `openid`, e-mail e perfil.
- [ ] Testar criação de conta, login, retorno ao domínio correto e vinculação de uma conta existente.

**Atenção:** Client Secret é segredo de servidor. Nunca colocar no código React, em variável `VITE_*`, no GitHub ou no navegador.

### 2. URL pública e Vercel

- [ ] Conectar a integração Vercel para conferir o projeto, a proteção do Preview e os domínios configurados.
- [ ] Decidir se o Kataru continuará usando o endereço Vercel ou terá domínio próprio.
- [ ] Confirmar que o endereço escolhido é público e que Deployment Protection não exige login dos testadores.
- [ ] Configurar o domínio e HTTPS/TLS na Vercel, caso seja escolhido um domínio próprio.
- [ ] Definir qual branch será promovida para Production. O PR #2 ainda está aberto e a `main` não foi atualizada por esta etapa.

**Não foi possível confirmar, nesta revisão, se o Preview atual exige autenticação da Vercel.** O status Ready/Success do deploy confirma o build/deploy, não a acessibilidade anônima do endereço.

### 3. Supabase Auth e entrega de e-mails

- [ ] Em Authentication → URL Configuration, definir a Site URL do endereço público escolhido.
- [ ] Autorizar Redirect URLs específicos para o domínio de produção, o Preview estável usado em testes e o ambiente local. Para o Preview atual, autorizar:
  `https://kataru-git-refine-mockup-fidelity-kataru.vercel.app/**`
- [ ] Ao configurar domínio próprio, incluir também:
  `https://SEU-DOMINIO/**`
- [ ] Confirmar a política de confirmação de e-mail e testar cadastro, reenvio de confirmação e recuperação de senha.
- [ ] Configurar SMTP próprio para produção; o serviço de e-mail padrão do Supabase é indicado para testes e pode ter limites e disponibilidade de melhor esforço.
- [ ] Ativar a proteção contra senhas vazadas (Leaked Password Protection) em Authentication → Password / Security. O advisor do Supabase apontou essa opção como desativada na última consulta.
- [ ] Considerar CAPTCHA e controles contra abuso de cadastro/login antes de abrir o acesso amplamente.

### 4. Documentos legais e privacidade

Arquivos atuais:
- `public/termos.html`
- `public/privacidade.html`

Antes de substituir a versão de revisão:

- [ ] Preencher nome/razão social ou identificação do responsável, CPF/CNPJ quando aplicável, endereço e e-mail oficial.
- [ ] Definir o canal de privacidade e, se aplicável, o contato do encarregado.
- [ ] Definir e implementar um processo real de exclusão de conta e dados; a interface atual não apresenta autoexclusão de conta.
- [ ] Definir prazos de retenção, backups, logs e descarte.
- [ ] Validar bases legais, direitos dos titulares, mecanismos de transferência internacional e relação com fornecedores.
- [ ] Decidir idade mínima e regras para usuários menores.
- [ ] Conferir políticas, suboperadores e regiões de processamento da Supabase, Vercel, Jikan e AniList.
- [ ] Revisar os textos com assessoria jurídica/privacidade.
- [ ] Remover o aviso de minuta e as diretivas `noindex, nofollow` somente quando os documentos definitivos estiverem completos e aprovados.

### 5. Pendência de perfil existente

Na última consulta havia uma conta em `auth.users`, mas nenhuma linha em `kataru_profiles`; o usuário existente também não tinha username nos metadados. O trigger cria o perfil para novos cadastros com username, mas não inventa um username para contas antigas. Definir um fluxo de escolha/edição de username para essa conta antes de tratar o perfil como completo.

## Testes finais necessários

- [ ] Acessar o site em janela anônima, sem sessão Vercel.
- [ ] Criar duas contas diferentes e confirmar que biblioteca, progresso, avaliações, notas e listas não se cruzam.
- [ ] Confirmar links de e-mail, login, logout, recuperação e troca de senha.
- [ ] Testar Google OAuth em domínio autorizado, depois de configurar credenciais.
- [ ] Testar desktop e mobile; estados vazios, erros, conexão lenta e falha das APIs externas.
- [ ] Verificar que os documentos finais estão acessíveis sem login.
- [ ] Revisar logs e advisors de segurança depois das configurações.

## Estado de liberação

O app pode continuar em testes controlados no Preview, desde que o endereço esteja público. Ainda não considero concluída a preparação para um lançamento público definitivo: faltam a confirmação do acesso Vercel, Google OAuth, SMTP, proteção contra senhas vazadas e conclusão/validação dos documentos legais.
