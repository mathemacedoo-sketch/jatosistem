# Política de segurança — MM ERP

## Arquitetura de produção

- O navegador usa somente a chave pública `anon`. A `service_role` existe exclusivamente em Supabase Edge Functions.
- Autenticação, hash bcrypt, recuperação de senha, rotação e renovação de tokens são fornecidos pelo Supabase Auth.
- Toda autorização é aplicada novamente no PostgreSQL por RLS; regras da interface não são consideradas controles de segurança.
- Cada registro operacional possui `empresa_id` e só pode ser lido ou alterado pelo tenant da sessão.
- Criação, alteração e exclusão de usuários passam pela função `manage-users`, que revalida sessão, função, empresa, origem e limite de requisições.
- Eventos de escrita são registrados em `auditoria`, que não possui política de escrita para clientes.

## Implantação obrigatória

1. Faça backup e teste `supabase-schema.sql` em staging antes de produção. A migração remove os registros legados do módulo `usuarios`, inclusive senhas em texto puro.
2. Crie o primeiro usuário em Supabase Authentication e execute o bootstrap comentado no fim do schema.
3. Implante `supabase/functions/manage-users` com validação JWT habilitada.
4. Configure `APP_ORIGIN` na função com a origem HTTPS exata da aplicação. Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` como variável `VITE_*`.
5. No Supabase Auth, desabilite cadastro público, exija confirmação de e-mail, habilite proteção contra senhas vazadas e MFA para `master`/`gerente`.
6. Configure limites de login e recuperação de senha no Auth. Recomendação inicial: 5 tentativas/minuto/IP, bloqueio progressivo e CAPTCHA após falhas repetidas.
7. Publique `public/_headers` em um host que respeite o arquivo (ou replique os cabeçalhos no proxy/CDN).
8. Use HTTPS obrigatório, backups point-in-time, logs com retenção e alertas para falhas de login, alterações de perfil e volume anormal de escrita.

## Gestão de segredos

- `.env.local` não deve ser versionado. Se já foi enviado a um repositório, rotacione a chave no Supabase.
- Tokens de sessão nunca devem ser registrados em logs.
- Credenciais temporárias devem ser entregues por canal separado e alteradas no primeiro acesso.

## Resposta a incidentes

Relate incidentes ao responsável da MM Tecnologia. Em suspeita de vazamento: revogue sessões, rotacione chaves, bloqueie a conta, preserve os logs de auditoria e só depois restaure o acesso.

