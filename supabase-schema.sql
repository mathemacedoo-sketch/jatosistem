-- Execute este arquivo uma vez no SQL Editor do Supabase.

create table if not exists public.sistema_registros (
  modulo text not null,
  registro_id text not null,
  empresa_id text,
  dados jsonb not null default '{}'::jsonb,
  dt_exc timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (modulo, registro_id)
);

create index if not exists sistema_registros_empresa_idx
  on public.sistema_registros (empresa_id);

alter table public.sistema_registros
  add column if not exists dt_exc timestamptz;

alter table public.clientes
  add column if not exists empresa_id text,
  add column if not exists codigo text,
  add column if not exists tipo_pessoa text default 'fisica',
  add column if not exists cpf_cnpj text,
  add column if not exists data_nascimento date,
  add column if not exists email text,
  add column if not exists telefone text,
  add column if not exists cep text,
  add column if not exists endereco text,
  add column if not exists numero text,
  add column if not exists bairro text,
  add column if not exists cidade text,
  add column if not exists estado text,
  add column if not exists marca text,
  add column if not exists veiculo text,
  add column if not exists cor text,
  add column if not exists ano text,
  add column if not exists placa text,
  add column if not exists motorista text,
  add column if not exists dt_exc timestamptz;

create index if not exists sistema_registros_ativos_idx
  on public.sistema_registros (modulo, empresa_id)
  where dt_exc is null;

create index if not exists clientes_ativos_idx
  on public.clientes (empresa_id)
  where dt_exc is null;

-- A aplicação atual usa login próprio e acessa o banco com a chave anon.
-- Estas políticas liberam o CRUD para esse modelo. Para produção, migre o login
-- para Supabase Auth e substitua-as por políticas vinculadas a auth.uid().
alter table public.sistema_registros enable row level security;
alter table public.clientes enable row level security;

drop policy if exists "sistema_registros_crud_anon" on public.sistema_registros;
create policy "sistema_registros_crud_anon"
  on public.sistema_registros for all to anon
  using (true) with check (true);

drop policy if exists "clientes_crud_anon" on public.clientes;
create policy "clientes_crud_anon"
  on public.clientes for all to anon
  using (true) with check (true);

-- Atualiza a credencial do usuário master padrão já existente.
update public.sistema_registros
set dados = jsonb_set(dados, '{senha}', '"admin"'::jsonb, true)
where modulo = 'usuarios'
  and dados->>'usuario' = 'admin'
  and dados->>'perfil' = 'master'
  and dt_exc is null;
