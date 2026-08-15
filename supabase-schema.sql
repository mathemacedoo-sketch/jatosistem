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
  add column if not exists tipo_veiculo text,
  add column if not exists marca text,
  add column if not exists veiculo text,
  add column if not exists frota text,
  add column if not exists cor text,
  add column if not exists ano text,
  add column if not exists placa text,
  add column if not exists motorista text,
  add column if not exists veiculos jsonb not null default '[]'::jsonb,
  add column if not exists dt_exc timestamptz;

-- Converte automaticamente o veículo único dos cadastros antigos em uma lista.
update public.clientes
set veiculos = jsonb_build_array(jsonb_build_object(
  'id', 'legado-' || id::text,
  'tipoVeiculo', coalesce(tipo_veiculo, ''),
  'marca', coalesce(marca, ''),
  'veiculo', coalesce(veiculo, ''),
  'cor', coalesce(cor, ''),
  'ano', coalesce(ano, ''),
  'placa', coalesce(placa, ''),
  'frota', coalesce(frota, ''),
  'motorista', coalesce(motorista, '')
))
where (veiculos is null or veiculos = '[]'::jsonb)
  and coalesce(tipo_veiculo, marca, veiculo, cor, ano, placa, frota, motorista) is not null;

create index if not exists sistema_registros_ativos_idx
  on public.sistema_registros (modulo, empresa_id)
  where dt_exc is null;

-- A Agenda lê diretamente as Ordens de Serviço programadas; não existe uma
-- segunda entidade de agendamento. O índice acelera a busca por empresa/data.
drop index if exists public.agendamentos_empresa_inicio_idx;
drop index if exists public.agendamentos_empresa_cliente_idx;
drop index if exists public.agendamentos_empresa_responsavel_idx;

create index if not exists ordens_empresa_programacao_idx
  on public.sistema_registros (empresa_id, (dados->>'dataProgramada'), (dados->>'horaInicio'))
  where modulo = 'ordens' and dt_exc is null and dados->>'dataProgramada' is not null;

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

-- Corrige dados antigos sem empresa: eles passam a pertencer Ã  empresa
-- administrativa mais antiga e deixam de ser compartilhados implicitamente.
do $$
declare
  empresa_padrao text;
begin
  select registro_id into empresa_padrao
  from public.sistema_registros
  where modulo = 'empresas' and dt_exc is null
  order by criado_em
  limit 1;

  if empresa_padrao is not null then
    update public.sistema_registros
       set empresa_id = empresa_padrao,
           dados = jsonb_set(dados, '{empresaId}', to_jsonb(empresa_padrao), true)
     where modulo not in ('empresas', '__meta__')
       and empresa_id is null;

    update public.clientes
       set empresa_id = empresa_padrao
     where empresa_id is null;
  end if;
end $$;

-- Nenhum dado operacional pode existir sem uma empresa.
alter table public.sistema_registros
  drop constraint if exists sistema_registros_empresa_obrigatoria;
alter table public.sistema_registros
  add constraint sistema_registros_empresa_obrigatoria
  check (modulo in ('empresas', '__meta__') or empresa_id is not null);

alter table public.clientes
  alter column empresa_id set not null;

-- Confirma que a empresa indicada realmente existe antes de gravar.
create or replace function public.validar_empresa_registro()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.empresa_id is not null and not exists (
    select 1
      from public.sistema_registros empresa
     where empresa.modulo = 'empresas'
       and empresa.registro_id = new.empresa_id
       and empresa.dt_exc is null
  ) then
    raise exception 'Empresa inexistente: %', new.empresa_id;
  end if;
  return new;
end;
$$;

drop trigger if exists validar_empresa_sistema_registros on public.sistema_registros;
create trigger validar_empresa_sistema_registros
before insert or update of empresa_id on public.sistema_registros
for each row
when (new.modulo not in ('empresas', '__meta__'))
execute function public.validar_empresa_registro();

drop trigger if exists validar_empresa_clientes on public.clientes;
create trigger validar_empresa_clientes
before insert or update of empresa_id on public.clientes
for each row
execute function public.validar_empresa_registro();
