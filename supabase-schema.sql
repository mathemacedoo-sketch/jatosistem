-- MM ERP - schema seguro para produção
-- Execute em projeto Supabase novo ou revise a migração antes de aplicar em produção.
-- Supabase Auth armazena senhas com bcrypt; senhas nunca pertencem às tabelas públicas.

begin;

create extension if not exists pgcrypto;

create table if not exists public.empresas (
  id text primary key default gen_random_uuid()::text,
  nome text not null check (char_length(nome) between 2 and 160),
  segmento text not null default 'lava-jato' check (char_length(segmento) <= 80),
  dados jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  empresa_id text not null references public.empresas(id) on delete restrict,
  nome text not null check (char_length(nome) between 2 and 160),
  perfil text not null check (perfil in ('master','gerente','usuario')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.sistema_registros (
  modulo text not null check (modulo ~ '^[a-zA-Z][a-zA-Z0-9_-]{0,49}$'),
  registro_id text not null check (char_length(registro_id) between 1 and 128),
  empresa_id text not null references public.empresas(id) on delete restrict,
  dados jsonb not null default '{}'::jsonb check (pg_column_size(dados) <= 1048576),
  dt_exc timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (modulo, registro_id),
  check (modulo <> 'usuarios')
);

-- Migra empresas legadas antes de fechar as restrições e remove módulos que não
-- podem mais existir no armazenamento JSON genérico.
insert into public.empresas(id, nome, segmento, dados, ativo, criado_em)
select registro_id, coalesce(nullif(dados->>'nome',''), 'Empresa'), coalesce(nullif(dados->>'segmento',''), 'lava-jato'), dados,
       coalesce(dados->>'status','ativo') = 'ativo', criado_em
from public.sistema_registros where modulo = 'empresas' and dt_exc is null
on conflict (id) do update set nome = excluded.nome, segmento = excluded.segmento, dados = excluded.dados;

delete from public.sistema_registros where modulo in ('empresas', 'usuarios', '__meta__');
alter table public.sistema_registros alter column empresa_id set not null;
alter table public.sistema_registros drop constraint if exists sistema_registros_empresa_fk;
alter table public.sistema_registros add constraint sistema_registros_empresa_fk foreign key (empresa_id) references public.empresas(id) on delete restrict;
alter table public.sistema_registros drop constraint if exists sistema_registros_sem_usuarios;
alter table public.sistema_registros add constraint sistema_registros_sem_usuarios check (modulo <> 'usuarios');

-- A tabela clientes já deve existir no projeto legado.
alter table public.clientes add column if not exists empresa_id text references public.empresas(id) on delete restrict;
alter table public.clientes add column if not exists dt_exc timestamptz;
alter table public.clientes alter column empresa_id set not null;
alter table public.clientes drop constraint if exists clientes_empresa_fk;
alter table public.clientes add constraint clientes_empresa_fk foreign key (empresa_id) references public.empresas(id) on delete restrict;

create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  ocorrido_em timestamptz not null default clock_timestamp(),
  usuario_id uuid references auth.users(id) on delete set null,
  empresa_id text references public.empresas(id) on delete set null,
  tabela text not null,
  operacao text not null check (operacao in ('INSERT','UPDATE','DELETE')),
  registro_id text,
  ip inet,
  user_agent text,
  dados_anteriores jsonb,
  dados_novos jsonb
);

create table if not exists public.rate_limits (
  chave text primary key,
  contador integer not null default 0,
  expira_em timestamptz not null
);

create or replace function public.consumir_rate_limit(p_chave text, p_limite integer) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_contador integer;
begin
  delete from public.rate_limits where expira_em < now();
  insert into public.rate_limits(chave, contador, expira_em) values (p_chave, 1, now() + interval '1 minute')
  on conflict (chave) do update set contador = public.rate_limits.contador + 1
  returning contador into v_contador;
  return v_contador <= least(greatest(p_limite, 1), 100);
end $$;
revoke all on function public.consumir_rate_limit(text, integer) from public, anon, authenticated;
grant execute on function public.consumir_rate_limit(text, integer) to service_role;
alter table public.rate_limits enable row level security;
alter table public.rate_limits force row level security;
revoke all on public.rate_limits from public, anon, authenticated;

create index if not exists registros_empresa_ativos_idx on public.sistema_registros(empresa_id, modulo) where dt_exc is null;
create index if not exists clientes_empresa_ativos_idx on public.clientes(empresa_id) where dt_exc is null;
create index if not exists perfis_empresa_idx on public.perfis(empresa_id) where ativo;
create index if not exists auditoria_empresa_data_idx on public.auditoria(empresa_id, ocorrido_em desc);

create or replace function public.empresa_atual() returns text
language sql stable security definer set search_path = public, pg_temp
as $$ select empresa_id from public.perfis where id = auth.uid() and ativo limit 1 $$;

create or replace function public.perfil_atual() returns text
language sql stable security definer set search_path = public, pg_temp
as $$ select perfil from public.perfis where id = auth.uid() and ativo limit 1 $$;

revoke all on function public.empresa_atual() from public;
revoke all on function public.perfil_atual() from public;
grant execute on function public.empresa_atual(), public.perfil_atual() to authenticated;

alter table public.empresas enable row level security;
alter table public.empresas force row level security;
alter table public.perfis enable row level security;
alter table public.perfis force row level security;
alter table public.sistema_registros enable row level security;
alter table public.sistema_registros force row level security;
alter table public.clientes enable row level security;
alter table public.clientes force row level security;
alter table public.auditoria enable row level security;
alter table public.auditoria force row level security;

drop policy if exists "sistema_registros_crud_anon" on public.sistema_registros;
drop policy if exists "clientes_crud_anon" on public.clientes;

create policy empresas_select_tenant on public.empresas for select to authenticated
using (id = public.empresa_atual() or public.perfil_atual() = 'master');
create policy empresas_master_write on public.empresas for all to authenticated
using (public.perfil_atual() = 'master') with check (public.perfil_atual() = 'master');

create policy perfis_select on public.perfis for select to authenticated
using (id = auth.uid() or (empresa_id = public.empresa_atual() and public.perfil_atual() in ('master','gerente')) or public.perfil_atual() = 'master');
-- Escritas em perfis só são feitas pela Edge Function com service_role.

create policy registros_select_tenant on public.sistema_registros for select to authenticated
using (empresa_id = public.empresa_atual());
create policy registros_insert_tenant on public.sistema_registros for insert to authenticated
with check (empresa_id = public.empresa_atual());
create policy registros_update_tenant on public.sistema_registros for update to authenticated
using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual());
create policy registros_delete_tenant on public.sistema_registros for delete to authenticated
using (empresa_id = public.empresa_atual() and public.perfil_atual() in ('master','gerente'));

create policy clientes_select_tenant on public.clientes for select to authenticated
using (empresa_id = public.empresa_atual());
create policy clientes_insert_tenant on public.clientes for insert to authenticated
with check (empresa_id = public.empresa_atual());
create policy clientes_update_tenant on public.clientes for update to authenticated
using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual());
create policy clientes_delete_tenant on public.clientes for delete to authenticated
using (empresa_id = public.empresa_atual() and public.perfil_atual() in ('master','gerente'));

create policy auditoria_leitura on public.auditoria for select to authenticated
using (empresa_id = public.empresa_atual() and public.perfil_atual() in ('master','gerente'));

create or replace function public.registrar_auditoria() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_empresa text; v_id text;
begin
  v_empresa := coalesce(to_jsonb(new)->>'empresa_id', to_jsonb(old)->>'empresa_id', public.empresa_atual());
  v_id := coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'registro_id', to_jsonb(old)->>'id', to_jsonb(old)->>'registro_id');
  insert into public.auditoria(usuario_id, empresa_id, tabela, operacao, registro_id, dados_anteriores, dados_novos)
  values (auth.uid(), v_empresa, tg_table_name, tg_op, v_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.registrar_auditoria() from public;

drop trigger if exists auditar_registros on public.sistema_registros;
create trigger auditar_registros after insert or update or delete on public.sistema_registros for each row execute function public.registrar_auditoria();
drop trigger if exists auditar_clientes on public.clientes;
create trigger auditar_clientes after insert or update or delete on public.clientes for each row execute function public.registrar_auditoria();

revoke all on public.empresas, public.perfis, public.sistema_registros, public.clientes, public.auditoria from anon;
grant select, insert, update, delete on public.empresas, public.sistema_registros, public.clientes to authenticated;
grant select on public.perfis, public.auditoria to authenticated;

commit;

-- BOOTSTRAP (execute uma única vez, substituindo os valores):
-- 1. Crie o primeiro usuário no painel Authentication > Users (senha forte; bcrypt é gerenciado pelo Supabase Auth).
-- 2. Crie a empresa e vincule o UUID do usuário:
-- insert into public.empresas(nome) values ('MM Tecnologia') returning id;
-- insert into public.perfis(id, empresa_id, nome, perfil) values ('UUID_AUTH', 'UUID_EMPRESA', 'Administrador', 'master');
