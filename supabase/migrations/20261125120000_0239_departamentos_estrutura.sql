-- 0239 — Departamentos: a ESTRUTURA (PRD-01 / #67, T4a)
--
-- Cria `departments`, `department_members` e `conversations.department_id`, com
-- RLS nas duas tabelas novas. É a metade ADITIVA da mudança de setor: NÃO troca
-- nenhuma policy existente e NÃO muda `fn_can_view_conversation`. Quem liga a regra
-- de visibilidade por setor é a T4b, e só depois da T3 (nenhuma rota com client
-- admin pode contornar a RLS nova). Spec: docs/specs/sdd/67-expediente-e-setor,
-- `02-design.md` §4.2.
--
-- Nenhuma linha existente muda de comportamento: toda conversa tem `department_id`
-- nulo ("sem setor") e continua visível como hoje. Não há backfill.
--
-- A integridade entre organizações é CONSTRAINT, não teste: o setor de uma conversa
-- tem de ser da MESMA organização dela (FK composta), e o operador de um setor tem
-- de ser MEMBRO da organização do setor (FK composta em `user_organizations`).
--
-- `conversations_department_fk` é NO ACTION (N1): apagar um setor com conversas
-- falha com 23503 (a API da T5 traduz em 409 `department_not_empty`) e apagar um
-- setor vazio funciona. Nunca apaga conversa (cascade fantasma) nem a devolve a
-- "sem setor" sem um ato explícito.
--
-- Sem função nova em `public`: o trigger de `updated_at` reusa `fn_set_updated_at()`.

create table if not exists public.departments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 60),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, organization_id)
);

create unique index if not exists uq_departments_org_name
  on public.departments (organization_id, lower(btrim(name)));

drop trigger if exists departments_updated_at on public.departments;
create trigger departments_updated_at before update on public.departments
  for each row execute function public.fn_set_updated_at();

create table if not exists public.department_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id   uuid not null,
  user_id         uuid not null,
  created_at      timestamptz not null default now(),
  primary key (department_id, user_id),
  foreign key (department_id, organization_id)
    references public.departments (id, organization_id) on delete cascade,
  foreign key (organization_id, user_id)
    references public.user_organizations (organization_id, user_id) on delete cascade
);

create index if not exists idx_department_members_user
  on public.department_members (organization_id, user_id);

-- A conversa ganha o setor (nullable: nasce sem setor).
alter table public.conversations add column if not exists department_id uuid;

-- NOT VALID: `conversations` é a tabela com tráfego ao vivo, e um `add constraint
-- foreign key` comum varre a tabela inteira com um lock que bloqueia escrita.
-- ATENÇÃO ao alcance do ganho: ele vale quando cada comando é uma transação própria, que é o caso
-- do `install.sh` e do `update.sh` (`psql -f`, sem `-1`). Se um runner envolver a migration inteira
-- numa transação (Supabase CLI), os locks do `add column` e do `add constraint` ficam até o commit e
-- a varredura do VALIDATE os segura. A coluna é nova e toda nula, então a varredura é curta, mas
-- nesse caminho NÃO é "sem bloqueio".
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'conversations_department_fk'
                    and conrelid = 'public.conversations'::regclass) then
    alter table public.conversations add constraint conversations_department_fk
      foreign key (department_id, organization_id)
      references public.departments (id, organization_id)
      not valid;
  end if;
end $$;

-- VALIDATE depois, num comando separado: fora de uma transação única ele usa um lock que não bloqueia
-- leitura nem escrita. Só roda se ainda não foi validada: re-aplicar pelo update.sh é um no-op.
do $$ begin
  if exists (select 1 from pg_constraint
              where conname = 'conversations_department_fk'
                and conrelid = 'public.conversations'::regclass
                and not convalidated) then
    alter table public.conversations validate constraint conversations_department_fk;
  end if;
end $$;

create index if not exists idx_conversations_department
  on public.conversations (organization_id, department_id)
  where department_id is not null;

-- RLS por comando (nunca FOR ALL): leitura para quem é membro da organização.
-- Escrita: em `departments` só `admin` (criar, renomear e apagar setor); em `department_members`
-- `manager` ou acima (vincular pessoas a um setor — decisão A do dono, 2026-11-25, #67).
alter table public.departments enable row level security;

drop policy if exists "departments_select" on public.departments;
create policy "departments_select" on public.departments
  for select using (organization_id in (select public.fn_user_org_ids()));

drop policy if exists "departments_insert" on public.departments;
create policy "departments_insert" on public.departments
  for insert with check (public.fn_role_at_least(organization_id, 'admin'));

drop policy if exists "departments_update" on public.departments;
create policy "departments_update" on public.departments
  for update using (public.fn_role_at_least(organization_id, 'admin'))
  with check (public.fn_role_at_least(organization_id, 'admin'));

drop policy if exists "departments_delete" on public.departments;
create policy "departments_delete" on public.departments
  for delete using (public.fn_role_at_least(organization_id, 'admin'));

alter table public.department_members enable row level security;

drop policy if exists "department_members_select" on public.department_members;
create policy "department_members_select" on public.department_members
  for select using (organization_id in (select public.fn_user_org_ids()));

drop policy if exists "department_members_insert" on public.department_members;
create policy "department_members_insert" on public.department_members
  for insert with check (public.fn_role_at_least(organization_id, 'manager'));

drop policy if exists "department_members_update" on public.department_members;
create policy "department_members_update" on public.department_members
  for update using (public.fn_role_at_least(organization_id, 'manager'))
  with check (public.fn_role_at_least(organization_id, 'manager'));

drop policy if exists "department_members_delete" on public.department_members;
create policy "department_members_delete" on public.department_members
  for delete using (public.fn_role_at_least(organization_id, 'manager'));

-- Sessão de suporte somente-leitura (migration de suporte temporário): o laço do baseline que
-- cria estas 3 policies RESTRITIVAS varre o catálogo e só alcança tabela que JÁ EXISTE quando
-- ele roda. As tabelas desta migration nascem depois dele, então numa instalação nova ficariam
-- sem o bloqueio e só o ganhariam no `update`. Criamos aqui, com os mesmos nomes e a mesma
-- definição do laço (drop + create, idempotente), para install e update chegarem ao mesmo estado.
do $sup$
declare t text;
begin
  foreach t in array array['departments','department_members'] loop
    execute format('drop policy if exists support_write_insert on public.%I', t);
    execute format('create policy support_write_insert on public.%I as restrictive for insert to authenticated with check (public.fn_support_write_allowed(organization_id))', t);
    execute format('drop policy if exists support_write_update on public.%I', t);
    execute format('create policy support_write_update on public.%I as restrictive for update to authenticated using (public.fn_support_write_allowed(organization_id)) with check (public.fn_support_write_allowed(organization_id))', t);
    execute format('drop policy if exists support_write_delete on public.%I', t);
    execute format('create policy support_write_delete on public.%I as restrictive for delete to authenticated using (public.fn_support_write_allowed(organization_id))', t);
  end loop;
end $sup$;
