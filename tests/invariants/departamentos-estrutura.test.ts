import { beforeAll, describe, expect, it } from "vitest";

import { countAs, sql, writeCountAs } from "./gov-helpers";

/**
 * A ESTRUTURA DE SETOR CHEGA AO CLONE E NASCE COM OS DENTES CERTOS (PRD-01 / #67, T4a, migration 0240).
 *
 * Lê o Postgres descartável que nasce do `supabase/baseline.sql` (`TEST_DB_CONTAINER`, via
 * `scripts/test-db.sh`), nunca o banco de dev. A migration é o caminho de quem já tem banco; o baseline
 * é o destino de quem clona — tabela que existe só na primeira não chega ao self-hoster.
 *
 * O que está sob prova, e por que cada coisa importa:
 *
 *  1. **Isolamento nas duas tabelas novas**, lendo e escrevendo, com o JWT de gente de verdade (não o
 *     superusuário, que tem `rolbypassrls`). `departments` e `department_members` ganham RLS por
 *     comando: leitura para quem é membro da organização, escrita só `admin`.
 *  2. **A integridade entre organizações é CONSTRAINT, não teste.** O setor de uma conversa tem de ser
 *     da MESMA organização dela, e o operador de um setor tem de ser MEMBRO da organização do setor.
 *     Um INSERT errado (rota com bug, client admin que ignora a RLS) FALHA, em vez de ser pego depois.
 *  3. **N1 — apagar setor com conversas falha; setor vazio apaga; organização inteira ainda apaga.** A
 *     FK é NO ACTION: nunca apaga conversa (cascade fantasma) nem a devolve a "sem setor" em silêncio.
 *  4. **Nada existente muda de comportamento:** a coluna nasce nula, a FK nasce validada, e a migration
 *     NÃO trocou nenhuma policy de `conversations` (isso é a T4b, depois da T3).
 *
 * Arquivo NOVO de propósito: `tests/invariants/**` é congelado contra modificação.
 */

// Namespace pela MIGRATION (`0240aaaa`/`0240bbbb`/`0240cccc`): os arquivos de invariante rodam em
// PARALELO contra o MESMO container, e o número da migration é único por construção.
const ORG_A = "0240aaaa-0000-4000-8000-000000000001";
const ORG_B = "0240bbbb-0000-4000-8000-000000000002";
const ORG_C = "0240cccc-0000-4000-8000-000000000003";
const ADMIN_A = "0240aaaa-1111-4000-8000-000000000001";
const AGENT_A = "0240aaaa-1111-4000-8000-000000000002";
const ADMIN_B = "0240bbbb-1111-4000-8000-000000000001";
const ADMIN_C = "0240cccc-1111-4000-8000-000000000001";
const SESSION_A = "0240aaaa-2222-4000-8000-000000000001";
const SESSION_B = "0240bbbb-2222-4000-8000-000000000002";
const SESSION_C = "0240cccc-2222-4000-8000-000000000003";
const CONTACT_A = "0240aaaa-3333-4000-8000-000000000001";
const CONTACT_B = "0240bbbb-3333-4000-8000-000000000002";
const CONTACT_C = "0240cccc-3333-4000-8000-000000000003";
const DEPT_A = "0240aaaa-4444-4000-8000-000000000001";
const DEPT_A_VAZIO = "0240aaaa-4444-4000-8000-000000000002";
const DEPT_B = "0240bbbb-4444-4000-8000-000000000001";
const DEPT_C = "0240cccc-4444-4000-8000-000000000001";
const CONV_A = "0240aaaa-5555-4000-8000-000000000001";
const CONV_B = "0240bbbb-5555-4000-8000-000000000001";
const CONV_C = "0240cccc-5555-4000-8000-000000000001";

/** Roda como superusuário e devolve o texto do erro; falha se o comando PASSAR. */
function falhaCom(script: string): string {
  try {
    sql(script);
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string };
    return String(err.stderr ?? "") + String(err.message ?? "");
  }
  throw new Error(`o comando passou — a trava não existe neste banco:\n${script}`);
}

function semear(): void {
  sql(`
    insert into auth.users (id, email) values
      ('${ADMIN_A}', 'dep-admin-a@invariant.test'),
      ('${AGENT_A}', 'dep-agent-a@invariant.test'),
      ('${ADMIN_B}', 'dep-admin-b@invariant.test'),
      ('${ADMIN_C}', 'dep-admin-c@invariant.test')
      on conflict do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'dep-inv-a', 'Departamentos Inv A', 'Dep Inv A'),
      ('${ORG_B}', 'dep-inv-b', 'Departamentos Inv B', 'Dep Inv B'),
      ('${ORG_C}', 'dep-inv-c', 'Departamentos Inv C', 'Dep Inv C')
      on conflict do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${ADMIN_A}', '${ORG_A}', 'admin', now()),
      ('${AGENT_A}', '${ORG_A}', 'agent', now()),
      ('${ADMIN_B}', '${ORG_B}', 'admin', now()),
      ('${ADMIN_C}', '${ORG_C}', 'admin', now())
      on conflict do nothing;
    -- DO + exception (não ON CONFLICT): channel_sessions tem unique DEFERRABLE.
    do $dep$ begin
      insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted) values
        ('${SESSION_A}', '${ORG_A}', 'dep-inv-a', '\\x00'::bytea),
        ('${SESSION_B}', '${ORG_B}', 'dep-inv-b', '\\x00'::bytea),
        ('${SESSION_C}', '${ORG_C}', 'dep-inv-c', '\\x00'::bytea);
    exception when unique_violation then null; end $dep$;
    insert into public.contacts (id, organization_id, display_name) values
      ('${CONTACT_A}', '${ORG_A}', 'Dep Inv Contato A'),
      ('${CONTACT_B}', '${ORG_B}', 'Dep Inv Contato B'),
      ('${CONTACT_C}', '${ORG_C}', 'Dep Inv Contato C')
      on conflict do nothing;
    insert into public.departments (id, organization_id, name) values
      ('${DEPT_A}', '${ORG_A}', 'Comercial'),
      ('${DEPT_A_VAZIO}', '${ORG_A}', 'Financeiro'),
      ('${DEPT_B}', '${ORG_B}', 'Comercial'),
      ('${DEPT_C}', '${ORG_C}', 'Suporte')
      on conflict do nothing;
    insert into public.conversations (id, organization_id, contact_id, channel_session_id, status, department_id) values
      ('${CONV_A}', '${ORG_A}', '${CONTACT_A}', '${SESSION_A}', 'open', '${DEPT_A}'),
      ('${CONV_B}', '${ORG_B}', '${CONTACT_B}', '${SESSION_B}', 'open', null),
      ('${CONV_C}', '${ORG_C}', '${CONTACT_C}', '${SESSION_C}', 'open', '${DEPT_C}')
      on conflict do nothing;
    insert into public.department_members (organization_id, department_id, user_id) values
      ('${ORG_A}', '${DEPT_A}', '${AGENT_A}')
      on conflict do nothing;
  `);
}

beforeAll(() => {
  semear();
});

describe("0240 · a estrutura de setor chega ao baseline que o clone recebe", () => {
  it("as duas tabelas e a coluna existem, com RLS ligada", () => {
    expect(
      sql(`select string_agg(relname || '=' || relrowsecurity::text, ',' order by relname)
             from pg_class where relnamespace = 'public'::regnamespace
              and relname in ('departments','department_members')`),
    ).toBe("department_members=true,departments=true");
    expect(
      sql(`select is_nullable || '/' || coalesce(column_default, 'sem-default')
             from information_schema.columns
            where table_schema = 'public' and table_name = 'conversations' and column_name = 'department_id'`),
    ).toBe("YES/sem-default");
  });

  it("a RLS é por comando (select, insert, update, delete) — nunca FOR ALL — e a sessão de suporte não escreve", () => {
    for (const tabela of ["departments", "department_members"]) {
      expect(
        sql(`select string_agg(cmd, ',' order by cmd) from pg_policies
              where schemaname = 'public' and tablename = '${tabela}' and permissive = 'PERMISSIVE'`),
        `${tabela} (permissivas)`,
      ).toBe("DELETE,INSERT,SELECT,UPDATE");
      // O laço de suporte do baseline só alcança tabela que já existe quando ele roda; estas nascem
      // depois, e a migration cria as 3 restritivas explicitamente. Sem elas, uma sessão de suporte
      // somente-leitura escreveria setor numa instalação nova.
      expect(
        sql(`select string_agg(polname, ',' order by polname) from pg_policy
              where polrelid = 'public.${tabela}'::regclass and not polpermissive`),
        `${tabela} (restritivas de suporte)`,
      ).toBe("support_write_delete,support_write_insert,support_write_update");
    }
  });

  it("a FK da conversa é composta, NO ACTION e já VALIDADA", () => {
    expect(
      sql(`select confdeltype::text || '/' || convalidated::text || '/' || array_length(conkey, 1)::text
             from pg_constraint
            where conname = 'conversations_department_fk' and conrelid = 'public.conversations'::regclass`),
    ).toBe("a/true/2");
  });

  it("a migration NÃO trocou policy de conversations (isso é a T4b, depois da T3)", () => {
    // Se esta lista mudar, quem mudou foi outra migration — e a regra de visibilidade por setor não
    // pode ligar antes de a T3 fechar as rotas com client admin (decisão do dono, 2026-11-17).
    expect(
      sql(`select count(*) from pg_policies
            where schemaname = 'public' and tablename = 'conversations'
              and (qual ilike '%department%' or with_check ilike '%department%')`),
    ).toBe("0");
  });
});

describe("0240 · isolamento entre organizações, com o JWT de gente de verdade", () => {
  it("o admin da org A lê o setor dela e NÃO lê o da org B (departments)", () => {
    expect(countAs(ADMIN_A, `select count(*) from public.departments where id in ('${DEPT_A}', '${DEPT_A_VAZIO}')`)).toBe(2);
    expect(countAs(ADMIN_A, `select count(*) from public.departments where organization_id = '${ORG_B}'`)).toBe(0);
    expect(countAs(ADMIN_B, `select count(*) from public.departments where organization_id = '${ORG_A}'`)).toBe(0);
  });

  it("o vínculo setor↔operador também não vaza (department_members)", () => {
    expect(countAs(ADMIN_A, `select count(*) from public.department_members where department_id = '${DEPT_A}' and user_id = '${AGENT_A}'`)).toBe(1);
    expect(countAs(ADMIN_B, `select count(*) from public.department_members where organization_id = '${ORG_A}'`)).toBe(0);
  });

  it("qualquer membro lê os setores da própria organização (agent inclusive)", () => {
    expect(countAs(AGENT_A, `select count(*) from public.departments where id in ('${DEPT_A}', '${DEPT_A_VAZIO}')`)).toBe(2);
  });

  it("só o admin escreve: o agent não cria, não renomeia e não apaga setor", () => {
    expect(
      writeCountAs(AGENT_A, `insert into public.departments (organization_id, name) values ('${ORG_A}', 'Do agent')`),
    ).toBe(0);
    expect(writeCountAs(AGENT_A, `update public.departments set name = 'Hackeado' where id = '${DEPT_A}'`)).toBe(0);
    expect(writeCountAs(AGENT_A, `delete from public.departments where id = '${DEPT_A_VAZIO}'`)).toBe(0);
    expect(
      writeCountAs(
        AGENT_A,
        `insert into public.department_members (organization_id, department_id, user_id)
           values ('${ORG_A}', '${DEPT_A_VAZIO}', '${AGENT_A}')`,
      ),
    ).toBe(0);
  });

  it("o admin escreve na própria organização, e NÃO na vizinha (o lado do WITH CHECK)", () => {
    expect(
      writeCountAs(ADMIN_A, `insert into public.departments (organization_id, name) values ('${ORG_A}', 'Jurídico')`),
    ).toBe(1);
    // com o organization_id da org A, vindo de um admin da org B
    expect(
      writeCountAs(ADMIN_B, `insert into public.departments (organization_id, name) values ('${ORG_A}', 'Invasor')`),
    ).toBe(0);
    expect(writeCountAs(ADMIN_B, `update public.departments set name = 'Hackeado' where id = '${DEPT_A}'`)).toBe(0);
    expect(writeCountAs(ADMIN_B, `delete from public.departments where id = '${DEPT_A_VAZIO}'`)).toBe(0);
  });
});

describe("0240 · a integridade entre organizações é constraint, não teste", () => {
  it("a conversa da org B não aponta para o setor da org A", () => {
    expect(
      falhaCom(`update public.conversations set department_id = '${DEPT_A}' where id = '${CONV_B}'`),
    ).toContain("conversations_department_fk");
  });

  it("o vínculo não aceita setor de uma organização com organization_id de outra", () => {
    expect(
      falhaCom(
        `insert into public.department_members (organization_id, department_id, user_id)
           values ('${ORG_B}', '${DEPT_A}', '${ADMIN_B}')`,
      ),
    ).toContain("violates foreign key constraint");
  });

  it("o operador do setor tem de ser MEMBRO da organização do setor (não basta existir em auth.users)", () => {
    expect(
      falhaCom(
        `insert into public.department_members (organization_id, department_id, user_id)
           values ('${ORG_A}', '${DEPT_A}', '${ADMIN_B}')`,
      ),
    ).toContain("violates foreign key constraint");
  });

  it("o nome é único por organização SEM diferenciar caixa nem espaço nas pontas — e outra organização repete à vontade", () => {
    expect(
      falhaCom(`insert into public.departments (organization_id, name) values ('${ORG_A}', '  comercial ')`),
    ).toContain("uq_departments_org_name");
    // DEPT_B já se chama 'Comercial' na org B: a mesma palavra convive entre organizações.
    expect(sql(`select count(*) from public.departments where lower(btrim(name)) = 'comercial'
                   and organization_id in ('${ORG_A}', '${ORG_B}')`)).toBe("2");
  });

  it("o nome vazio e o nome com mais de 60 caracteres são recusados", () => {
    expect(falhaCom(`insert into public.departments (organization_id, name) values ('${ORG_A}', '   ')`)).toContain(
      "violates check constraint",
    );
    expect(
      falhaCom(`insert into public.departments (organization_id, name) values ('${ORG_A}', '${"x".repeat(61)}')`),
    ).toContain("violates check constraint");
  });

  it("renomear o setor atualiza updated_at (o trigger padrão do repo)", () => {
    sql(`select pg_sleep(0.05); update public.departments set name = 'Financeiro Renomeado' where id = '${DEPT_A_VAZIO}'`);
    expect(sql(`select updated_at > created_at from public.departments where id = '${DEPT_A_VAZIO}'`)).toBe("t");
    sql(`update public.departments set name = 'Financeiro' where id = '${DEPT_A_VAZIO}'`);
  });
});

describe("0240 · N1 — apagar setor nunca apaga nem desvincula conversa", () => {
  it("apagar um setor COM conversas falha (NO ACTION), e a conversa continua no setor", () => {
    expect(falhaCom(`delete from public.departments where id = '${DEPT_A}'`)).toContain("conversations_department_fk");
    expect(sql(`select department_id from public.conversations where id = '${CONV_A}'`)).toBe(DEPT_A);
  });

  it("apagar um setor VAZIO funciona, e leva os vínculos junto (cascade só do vínculo)", () => {
    sql(`insert into public.departments (id, organization_id, name)
           values ('0240aaaa-4444-4000-8000-0000000000aa', '${ORG_A}', 'Temporário') on conflict do nothing;
         insert into public.department_members (organization_id, department_id, user_id)
           values ('${ORG_A}', '0240aaaa-4444-4000-8000-0000000000aa', '${AGENT_A}') on conflict do nothing;
         delete from public.departments where id = '0240aaaa-4444-4000-8000-0000000000aa';`);
    expect(sql(`select count(*) from public.department_members where department_id = '0240aaaa-4444-4000-8000-0000000000aa'`)).toBe("0");
  });

  it("apagar a ORGANIZAÇÃO inteira continua funcionando, mesmo com conversa dentro de setor", () => {
    // O NO ACTION é verificado no fim do comando: o cascade da organização leva setores e conversas
    // juntos e a FK não tem o que reclamar. É a garantia que justifica `no action` em vez de `restrict`.
    sql(`delete from public.organizations where id = '${ORG_C}'`);
    expect(sql(`select count(*) from public.departments where organization_id = '${ORG_C}'`)).toBe("0");
    expect(sql(`select count(*) from public.conversations where organization_id = '${ORG_C}'`)).toBe("0");
  });
});
