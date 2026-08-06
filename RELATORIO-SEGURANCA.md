# Relatório de segurança — MM ERP

Data da revisão: 05/08/2026

## Resumo executivo

A versão auditada não estava apta para produção. O login era validado no navegador, senhas eram gravadas em texto puro, uma conta `admin/admin` era recriada automaticamente e as políticas RLS permitiam CRUD anônimo entre empresas. Essas falhas possibilitavam acesso direto ao banco sem passar pela tela de login.

As correções implementadas substituem esse modelo por Supabase Auth com bcrypt, sessões JWT, autorização RLS por empresa, administração privilegiada em Edge Function, limitação de operações administrativas, auditoria imutável para clientes, validação de entradas e cabeçalhos defensivos.

## Achados e correções

| Severidade | Vulnerabilidade encontrada | Correção aplicada |
|---|---|---|
| Crítica | CRUD anônimo com `using (true)` | Políticas anônimas removidas; RLS forçada e vinculada a `auth.uid()` e `empresa_id` |
| Crítica | Senhas em JSON/texto puro | Módulo legado `usuarios` removido; credenciais migradas para Supabase Auth/bcrypt |
| Crítica | Conta padrão `admin/admin` recriada no cliente e no banco | Credencial e rotina de restauração eliminadas; bootstrap administrativo manual e auditável |
| Crítica | Autenticação apenas no React | Login substituído por `signInWithPassword`; banco e função administrativa revalidam a sessão |
| Alta | Mistura de dados entre tenants | Chave de empresa obrigatória, FKs, índices e políticas de isolamento por tenant |
| Alta | Administração de usuários pelo cliente | Operações movidas para Edge Function com `service_role` somente no servidor e checagem de função |
| Alta | Dados completos persistidos em `localStorage` | Cache do banco removido; apenas preferências não sensíveis de interface permanecem locais |
| Alta | Ausência de trilha de auditoria confiável | Tabela e triggers de auditoria server-side; clientes possuem somente leitura autorizada |
| Média | Ausência de rate limiting administrativo | Contador atômico por usuário/IP/minuto na Edge Function; retorna HTTP 429 |
| Média | Entradas sem limite e normalização uniforme | Sanitização recursiva, NFKC, limites de tamanho, bloqueio de prototype pollution e números inválidos |
| Média | Risco XSS em documento de impressão | Conteúdo dinâmico continua passando por `escapeHtml`; React escapa as demais renderizações |
| Média | Ausência de CSP e cabeçalhos defensivos | CSP, HSTS, anti-clickjacking, `nosniff`, política de permissões e referrer policy adicionados |
| Média | Arquivo de ambiente sem proteção de versionamento | `.gitignore` e `.env.example` seguros adicionados |
| Baixa | Falta de verificação de dependências | `npm audit` executado: 0 vulnerabilidades em 88 dependências |

## SQL injection, XSS e CSRF

- SQL injection: não há concatenação de SQL no cliente. As operações usam o SDK Supabase/PostgREST com parâmetros; funções SQL usam parâmetros tipados e `search_path` fixo.
- XSS: React fornece escaping padrão; a única saída HTML manual, o recibo de impressão, usa escaping contextual. CSP reduz o impacto de uma eventual regressão.
- CSRF: a API utiliza token Bearer, não autenticação implícita por cookie. A Edge Function ainda exige origem exata e método POST. Isso evita que outro site dispare operações administrativas com credenciais do usuário.

## Dependências

`npm audit` consultou a base oficial do npm e retornou: 0 críticas, 0 altas, 0 moderadas e 0 baixas. O alerta de bundle do Vite é de desempenho, não uma vulnerabilidade.

## Riscos residuais e ações externas obrigatórias

O código sozinho não configura o painel do Supabase nem o provedor de hospedagem. Antes da publicação, conclua os itens de implantação em `SECURITY.md`, sobretudo MFA, confirmação de e-mail, proteção contra senhas vazadas, limites de autenticação, HTTPS e aplicação real dos cabeçalhos. A migração deve ser testada com backup porque remove credenciais legadas inseguras.

