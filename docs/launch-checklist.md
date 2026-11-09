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
| Google Login | Fluxo implementado no app; provedor não confirmado | Habilitar Google em Supabase Auth e informar as credenciais OAuth |
| SMTP próprio | Não confirmado | Escolher provedor SMTP e configurar credenciais no Supabase |
| Domínio próprio | Não escolhido / ainda não verificado | Definir domínio antes de registrar e configurar na Vercel |
| Acesso público do Preview | Não confirmado | A inspeção administrativa da Vercel requer autorização da equipe |
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

O domínio definitivo ainda precisa ser escolhido. Depois da escolha:

1. Registrar ou confirmar a titularidade do domínio.
2. Adicionar o domínio ao projeto Kataru na Vercel.
3. Configurar os registros DNS indicados pela Vercel e verificar o domínio.
4. Escolher o domínio canônico e configurar redirecionamento do domínio alternativo, se necessário.
5. Atualizar Site URL e Redirect URLs no Supabase.
6. Atualizar URLs de OAuth, e-mail e documentos legais.
7. Conferir Deployment Protection na Vercel. O Preview só pode ser considerado público se uma janela anônima conseguir abri-lo sem login da Vercel. O login do próprio Kataru continuará sendo exigido para bibliotecas individuais.

A inspeção das configurações da equipe Vercel está pendente de aprovação do consentimento de acesso da conexão à equipe Kataru. Depois da aprovação, revisar domínios, proteção do projeto e deployment Preview.

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
