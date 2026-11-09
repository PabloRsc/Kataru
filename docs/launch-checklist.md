# Kataru — checklist de preparação para lançamento

Última revisão: 9 de novembro de 2026  
Branch de trabalho: `refine/mockup-fidelity`  
Projeto Supabase: `doqegxnwclbomyxmgbrb`

Este checklist registra o que foi confirmado por inspeção de código, consultas ao projeto Supabase e documentação oficial. “Não confirmado” não significa necessariamente desativado; significa que a configuração ainda precisa ser inspecionada no painel.

## Estado atual

| Item | Situação | Evidência / próximo passo |
|---|---|---|
| Login por e-mail e senha | Implementado no app | `src/AuthGate.jsx` |
| Recuperação e confirmação de e-mail | Implementadas no app | Confirmar URL Configuration e entrega de e-mails |
| Google Login | Fluxo implementado no app; estado do provedor ainda não foi possível ler pela conexão Supabase | Conferir em Authentication → Providers e concluir OAuth no painel |
| SMTP próprio | Não confirmado pela conexão de leitura | Conferir em Authentication → SMTP Settings; escolher provedor e cadastrar as credenciais no painel |
| Domínio próprio | Nenhum domínio personalizado anexado | O projeto só tem o domínio Vercel `kataru-two.vercel.app` verificado; escolher um domínio próprio |
| Acesso público do Preview | Protegido por SSO | Vercel confirmou `ssoProtection.enabled=true` e `deploymentType=all_except_custom_domains`; Preview exige login da equipe |
| Verificação de senhas vazadas | Desativada | O Supabase informa que este recurso requer plano Pro ou superior |
| Termos e Privacidade | Minutas beta, incompletas | Completar dados do responsável e validar conteúdo antes de lançamento público |
| RLS das bibliotecas/listas | Ativo | Verificação do projeto: `anime_collection` está com RLS ligado |
| Diagnóstico de performance Supabase | Sem avisos | Advisor de performance retornou zero lints |
| Diagnóstico de segurança Supabase | Avisos | Proteção de senhas vazadas desativada; RPC de disponibilidade de username é SECURITY DEFINER e foi sinalizada pelo Advisor |

## Google Login

O botão e o método `signInWithOAuth({ provider: 'google' })` já estão no app. Isso, isoladamente, não habilita o provedor.

1. Criar ou selecionar um projeto no [Google Cloud Console](https://console.cloud.google.com/).
2. Configurar a tela de consentimento OAuth e criar uma credencial OAuth do tipo Web application.
3. Usar este URI de callback do Supabase como **Authorized redirect URI**:

   `https://doqegxnwclbomyxmgbrb.supabase.co/auth/v1/callback`

4. No Supabase, abrir [Authentication → Providers](https://supabase.com/dashboard/project/doqegxnwclbomyxmgbrb/auth/providers) e habilitar Google, inserindo Client ID e Client Secret.
5. Em [Authentication → URL Configuration](https://supabase.com/dashboard/project/doqegxnwclbomyxmgbrb/auth/url-configuration), definir a Site URL de produção e adicionar Redirect URLs para o domínio definitivo, Preview usado nos testes e ambiente local.
6. Testar login, logout, retorno do OAuth e criação de perfil.

Nunca colocar Client Secret do Google em variável `VITE_*`, no navegador, no Git ou em mensagens de chat. Inserir o segredo somente no painel do Supabase.

## SMTP próprio

O app usa Supabase Auth para confirmação, reenvio e recuperação de senha. O SMTP padrão do Supabase é para testes: o serviço integrado envia somente para endereços autorizados da equipe, tem limites de envio e não oferece SLA de produção.

1. Escolher um provedor SMTP. A documentação do Supabase lista, entre outros, Resend, AWS SES, Postmark, SendGrid, ZeptoMail e Brevo.
2. Criar e autenticar um domínio/remetente de envio, por exemplo `no-reply@<dominio>`.
3. Obter host, porta, usuário e senha SMTP do provedor.
4. Configurar os dados em [Authentication → SMTP Settings](https://supabase.com/dashboard/project/doqegxnwclbomyxmgbrb/auth/smtp).
5. Configurar os registros DNS exigidos pelo provedor, incluindo SPF, DKIM e DMARC.
6. Testar confirmação de conta, reenvio e recuperação de senha com endereços que não sejam membros da equipe.

A senha SMTP é um segredo: inserir diretamente no painel do Supabase, nunca no repositório ou chat.

## Domínio próprio e acesso público

**Inspeção administrativa realizada em 9 de novembro de 2026, após aprovação do acesso da equipe Vercel:**

- O projeto Vercel `kataru` está com SSO Protection ativada.
- A modalidade atual é `all_except_custom_domains`: os deployments ficam protegidos, exceto quando acessados por domínios personalizados anexados ao projeto.
- Password Protection está desativada; isso não torna o Preview público, porque a proteção SSO está ativa.
- O único domínio anexado e verificado retornado pela listagem do projeto é `kataru-two.vercel.app`, que é um subdomínio gerenciado pela Vercel, não um domínio personalizado.
- Não há domínio próprio anexado.
- O Preview mais recente da branch `refine/mockup-fidelity` está `READY`, no commit `e1aba7d298c0801ac69e4589d8543469f7d2e7d6`, mas exige autenticação SSO da equipe.
- Há um deployment de produção `READY` da branch `main`, no commit `bcb73d1b17430714c26160e8fe6545f7ebfc7997`. As melhorias do PR #2 ainda não foram publicadas em produção.
- As variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` existem nos ambientes Preview e Production da Vercel; os valores foram mantidos ocultos durante a inspeção.

**Caminho recomendado para abrir o app aos usuários sem expor os Previews:**

1. Escolher ou registrar um domínio próprio.
2. Adicionar esse domínio ao projeto Kataru na Vercel e configurar os registros DNS solicitados.
3. A modalidade SSO atual exclui domínios personalizados da proteção; manter SSO ativado para continuar protegendo os URLs de Preview.
4. Definir qual deployment/branch será publicado em Production. O PR #2 está aberto e a `main` não recebeu essas alterações.
5. Atualizar Site URL e Redirect URLs no Supabase para o domínio canônico e os ambientes de teste.
6. Atualizar URLs de OAuth, e-mail e documentos legais.
7. Testar o domínio próprio em janela anônima. O acesso público ao site não deve remover o login do Kataru nem a privacidade das bibliotecas individuais.

Não desativar SSO Protection do projeto inteiro sem uma decisão explícita: a configuração atual permite separar o domínio público dos Preview deployments protegidos.

## Proteção de senhas vazadas

O Supabase Advisor confirmou que Leaked Password Protection está desativada. A organização Kataru está no plano Free. A documentação oficial do Supabase informa que a proteção integrada via HaveIBeenPwned.org está disponível no plano Pro ou superior.

Próximo passo: decidir se a equipe fará upgrade para Pro ou superior. Depois, habilitar a proteção nas configurações de senha do Supabase Auth e repetir o Advisor de segurança. A validação de força de senha existente no frontend não substitui a checagem de senhas comprometidas no servidor.

## Termos e Política de Privacidade

Arquivos atuais: `public/termos.html` e `public/privacidade.html`. Ambos se identificam como “Versão de revisão · beta” e contêm marcadores de preenchimento. Não publicar como política final antes de resolver:

- Nome/razão social do responsável, CPF/CNPJ quando aplicável, endereço e contato oficial.
- Canal de privacidade e responsável/encarregado, se aplicável.
- Bases legais por finalidade e prazos de retenção para contas, bibliotecas, logs e backups.
- Procedimento, prazo e verificação de identidade para solicitações de titulares e exclusão de conta.
- Faixa etária mínima e tratamento de contas de crianças/adolescentes.
- Transferências internacionais, salvaguardas e lista de fornecedores/suboperadores.
- Revisão jurídica final e data de vigência.

O projeto Supabase consultado está na região `us-east-1` (Estados Unidos). Esse fato já aparece na minuta de privacidade; as transferências e salvaguardas aplicáveis ainda precisam ser avaliadas.

## Avisos de segurança conhecidos

O Advisor sinaliza a função `public.is_kataru_username_available(text)` porque ela é `SECURITY DEFINER` e pode ser executada por `anon` e `authenticated`. Ela foi projetada como helper público de cadastro e retorna somente um booleano, sem expor linhas de perfil. O aviso deve permanecer documentado e ser reavaliado em uma revisão de segurança; não remover a função sem substituir o fluxo de verificação de username.

## Fontes oficiais consultadas

- Supabase — [Password security](https://supabase.com/docs/guides/auth/password-security)
- Supabase — [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- Supabase — [Google social login](https://supabase.com/docs/guides/auth/social-login/auth-google)
- Vercel — [Deployment Protection](https://vercel.com/docs/deployment-protection)
