import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * ESCRITA POR PAPEL NAS TABELAS DO AGENTE (#141, spec
 * `docs/specs/sdd/141-escrita-por-papel-nas-tabelas-do-agente/`, migration 0243).
 *
 * As tabelas do laço de policies do motor do agente só filtravam por organização: um `viewer` inseria,
 * alterava e apagava direto pelo PostgREST. A regra nova é "fechado por padrão": `authenticated` não
 * escreve em nenhuma delas, menos nos quatro caminhos que o app usa com a sessão do usuário, e esses
 * exigem `agent`+.
 *
 *  - CA-1: `viewer` não insere, altera, apaga nem trunca em NENHUMA tabela do laço (por execução).
 *  - CA-2: `agent` zera `lead_state.next_action`; `viewer` não; outra coluna é recusada.
 *  - CA-3: os três `insert` permitidos funcionam para `agent`, não para `viewer`, e só com o formato
 *    que a rota grava.
 *  - CA-5: a lista vem do próprio laço no `baseline.sql`: tabela nova sem a restrição reprova aqui.
 *
 * Toda tentativa de escrita roda em transação desfeita: no estado vermelho a escrita PASSA, e não pode
 * levar embora o cenário do caso seguinte.
 */

const ORG = "0243aaaa-0000-4000-8000-000000000001";
const ORG_B = "0243aaaa-0000-4000-8000-0000000000b1";
const VIEWER = "0243aaaa-1111-4000-8000-000000000001";
const AGENTE = "0243aaaa-1111-4000-8000-000000000002";
const AGENTE_B = "0243aaaa-1111-4000-8000-0000000000b2"; // agent só da ORG_B
const MANAGER = "0243aaaa-1111-4000-8000-000000000003";
const CONTATO = "0243aaaa-2222-4000-8000-000000000001";
const SESSAO_CANAL = "0243aaaa-3333-4000-8000-000000000001";
const JOB = "0243aaaa-4444-4000-8000-000000000001";

const BASELINE = readFileSync(join(process.cwd(), "supabase", "baseline.sql"), "utf8");

/** A lista do laço que cria `tenant_isolation_<t>_all` para as tabelas do motor. */
function tabelasDoLaco(): string[] {
  const blocos = [...BASELINE.matchAll(/foreach t in array array\[([\s\S]*?)\]\s*loop/g)]
    .map((m) => m[1] ?? "")
    .filter((corpo) => corpo.includes("'job_queue'") && corpo.includes("'lead_state'"));
  // O primeiro é o laço original; o apêndice repete a lista para revogar.
  const original = blocos[0];
  if (!original) throw new Error("laço das tabelas do agente não encontrado no baseline.sql");
  return [...original.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string);
}

const TABELAS = tabelasDoLaco();

/** As exceções declaradas na spec (02-design §2). O resto não escreve nada. */
const INSERT_PERMITIDO = ["agent_inbox_items", "cron_jobs", "lead_checkpoints"];
const UPDATE_DE_COLUNA: Record<string, string[]> = { lead_state: ["next_action"] };

type Resposta = { linhas: number } | "sem_privilegio" | "rls" | `outro: ${string}`;

/** Executa como `authenticated` com o JWT do usuário e DESFAZ. */
function tenta(userId: string, comando: string): Resposta {
  try {
    const out = sql(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${userId}"}', true);
      ${comando};
      rollback;
    `);
    const numero = out.split("\n").filter((l) => /^\d+$/.test(l)).pop();
    return { linhas: numero === undefined ? -1 : Number(numero) };
  } catch (err) {
    const stderr = String((err as { stderr?: Buffer | string }).stderr ?? "");
    if (stderr.includes("permission denied")) return "sem_privilegio";
    if (stderr.includes("row-level security")) return "rls";
    return `outro: ${stderr.trim().split("\n")[0] ?? ""}`;
  }
}

/** DML com contagem das linhas afetadas. */
const conta = (dml: string) => `with w as (${dml} returning 1) select count(*) from w`;

const insertCheckpoint = (jobId: string) =>
  conta(`insert into public.lead_checkpoints
    (organization_id, contact_id, job_id, commitments, objections, next_action, rolling_summary)
    values ('${ORG}', '${CONTATO}', ${jobId}, '[]', '[]', null, 'devolvido ao automático')`);

const insertCron = (kind: string, jobKind: string, intervalo = "null") =>
  conta(`insert into public.cron_jobs
    (organization_id, contact_id, kind, interval_ms, job_kind, next_run_at, payload)
    values ('${ORG}', '${CONTATO}', '${kind}', ${intervalo}, '${jobKind}', now(),
            '{"source":"reactivation"}')`);

const insertAviso = (kind: string) =>
  conta(`insert into public.agent_inbox_items
    (organization_id, kind, severity, title, body, ref_kind, ref_id, status)
    values ('${ORG}', '${kind}', 'warn', 'proposta sem dono', 'corpo', 'contact', '${CONTATO}', 'open')`);

const zeraProximaAcao = conta(
  `update public.lead_state set next_action = null
    where organization_id = '${ORG}' and contact_id = '${CONTATO}'`,
);

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${VIEWER}', 'epp-viewer@invariant.test'),
      ('${AGENTE}', 'epp-agente@invariant.test'),
      ('${AGENTE_B}', 'epp-agente-b@invariant.test'),
      ('${MANAGER}', 'epp-manager@invariant.test')
      on conflict do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG}', 'epp-inv', 'Escrita Por Papel Inv', 'EPP Inv'),
      ('${ORG_B}', 'epp-inv-b', 'Escrita Por Papel Inv B', 'EPP Inv B')
      on conflict do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${VIEWER}', '${ORG}', 'viewer', now()),
      ('${AGENTE}', '${ORG}', 'agent', now()),
      ('${AGENTE_B}', '${ORG_B}', 'agent', now()),
      ('${MANAGER}', '${ORG}', 'manager', now())
      on conflict do nothing;
    insert into public.contacts (id, organization_id, display_name)
      values ('${CONTATO}', '${ORG}', 'Contato EPP') on conflict do nothing;
    -- DO + exception (não ON CONFLICT): channel_sessions tem unique DEFERRABLE.
    do $epp$ begin
      insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
        values ('${SESSAO_CANAL}', '${ORG}', 'epp-inv', '\\x00'::bytea);
    exception when unique_violation then null; end $epp$;
    insert into public.job_queue (id, organization_id, kind)
      values ('${JOB}', '${ORG}', 'watchdog') on conflict do nothing;
    insert into public.lead_state (organization_id, contact_id, next_action)
      values ('${ORG}', '${CONTATO}', 'ligar amanhã') on conflict do nothing;
    insert into public.lead_state_transitions (organization_id, contact_id, from_stage, to_stage)
      values ('${ORG}', '${CONTATO}', 'new', 'contacted');
    insert into public.outbound_copies (organization_id, channel_session_id, normalized_text, normalized_hash)
      values ('${ORG}', '${SESSAO_CANAL}', 'oi', 'hash-epp');
  `);
});

describe("CA-5 · a lista é a do laço no baseline.sql", () => {
  it("o laço foi lido e contém as tabelas da issue", () => {
    expect(TABELAS.length).toBeGreaterThanOrEqual(30);
    expect(TABELAS).toEqual(
      expect.arrayContaining(["lead_state", "lead_state_transitions", "outbound_copies", "job_queue"]),
    );
  });

  it("nenhuma tabela do laço dá escrita a authenticated além das exceções declaradas", () => {
    const sobras = sql(`
      select t || ':' || p
        from unnest(array[${TABELAS.map((t) => `'${t}'`).join(",")}]) t
        cross join unnest(array['insert','update','delete','truncate']) p
       where has_table_privilege('authenticated', 'public.' || t, p)
          or (p in ('insert','update') and has_any_column_privilege('authenticated', 'public.' || t, p))
       order by 1;
    `)
      .split("\n")
      .filter(Boolean);

    const esperadas = [
      ...INSERT_PERMITIDO.map((t) => `${t}:insert`),
      ...Object.keys(UPDATE_DE_COLUNA).map((t) => `${t}:update`),
    ].sort();
    expect(sobras.sort()).toEqual(esperadas);
  });

  it("em lead_state o update é só da coluna next_action", () => {
    const colunas = sql(`
      select a.attname from pg_attribute a
       where a.attrelid = 'public.lead_state'::regclass and a.attnum > 0 and not a.attisdropped
         and has_column_privilege('authenticated', a.attrelid, a.attnum, 'update')
       order by 1;
    `).split("\n");
    expect(colunas).toEqual(UPDATE_DE_COLUNA.lead_state);
  });

  it("a leitura não mudou e o service_role segue escrevendo (RNF-2)", () => {
    const perdas = sql(`
      select t || ':' || r || ':' || p
        from unnest(array[${TABELAS.map((t) => `'${t}'`).join(",")}]) t
        cross join (values ('authenticated','select'), ('service_role','insert'),
                           ('service_role','update'), ('service_role','delete')) v(r, p)
       where not has_table_privilege(r, 'public.' || t, p);
    `);
    // outbound_copies sem SELECT é decisão do #145 (T3.0 da #67), compatível com esta.
    expect(perdas.split("\n").filter((l) => l && l !== "outbound_copies:authenticated:select")).toEqual([]);
  });
});

describe("CA-1 · viewer não escreve em nenhuma tabela do laço", () => {
  it.each(TABELAS)("%s: insert, update, delete e truncate são recusados", (t) => {
    expect({
      insert: tenta(VIEWER, conta(`insert into public.${t} default values`)),
      update: tenta(VIEWER, conta(`update public.${t} set organization_id = organization_id`)),
      delete: tenta(VIEWER, conta(`delete from public.${t}`)),
      truncate: tenta(VIEWER, `truncate public.${t} cascade`),
    }).toEqual({
      // Nas exceções o privilégio existe e quem recusa é a policy restritiva.
      insert: INSERT_PERMITIDO.includes(t) ? "rls" : "sem_privilegio",
      update: "sem_privilegio",
      delete: "sem_privilegio",
      truncate: "sem_privilegio",
    });
  });
});

describe("CA-2 · decisão da próxima ação (leads/[id]/next-action)", () => {
  it("agent zera next_action", () => {
    expect(tenta(AGENTE, zeraProximaAcao)).toEqual({ linhas: 1 });
  });

  it("viewer não altera linha nenhuma", () => {
    expect(tenta(VIEWER, zeraProximaAcao)).toEqual({ linhas: 0 });
  });

  it("agent de outra organização não altera linha nenhuma", () => {
    expect(tenta(AGENTE_B, zeraProximaAcao)).toEqual({ linhas: 0 });
  });

  it("agent não altera outra coluna, nem junto com next_action", () => {
    expect(tenta(AGENTE, conta(`update public.lead_state set stage = 'won'`))).toBe("sem_privilegio");
    expect(
      tenta(AGENTE, conta(`update public.lead_state set next_action = null, stage = 'won'`)),
    ).toBe("sem_privilegio");
  });
});

describe("CA-3 · os três inserts que o app faz com a sessão do usuário", () => {
  it("checkpoint de retomada: agent grava, viewer e outra organização não", () => {
    expect(tenta(AGENTE, insertCheckpoint("null"))).toEqual({ linhas: 1 });
    expect(tenta(VIEWER, insertCheckpoint("null"))).toBe("rls");
    expect(tenta(AGENTE_B, insertCheckpoint("null"))).toBe("rls");
  });

  it("checkpoint com job_id é do motor, não de uma pessoa", () => {
    expect(tenta(AGENTE, insertCheckpoint(`'${JOB}'`))).toBe("rls");
  });

  it("follow-up de reativação: agent grava, viewer e outra organização não", () => {
    expect(tenta(AGENTE, insertCron("at", "followup_turn"))).toEqual({ linhas: 1 });
    expect(tenta(VIEWER, insertCron("at", "followup_turn"))).toBe("rls");
    expect(tenta(AGENTE_B, insertCron("at", "followup_turn"))).toBe("rls");
  });

  it("cron fora do formato da reativação é recusado", () => {
    expect(tenta(AGENTE, insertCron("every", "followup_turn", "60000"))).toBe("rls");
    expect(tenta(AGENTE, insertCron("at", "inbound_turn"))).toBe("rls");
    expect(tenta(AGENTE, insertCron("at", "watchdog"))).toBe("rls");
  });

  it("aviso de proposta ambígua: agent grava, viewer e outra organização não", () => {
    expect(tenta(AGENTE, insertAviso("next_action_ambiguous"))).toEqual({ linhas: 1 });
    expect(tenta(VIEWER, insertAviso("next_action_ambiguous"))).toBe("rls");
    expect(tenta(AGENTE_B, insertAviso("next_action_ambiguous"))).toBe("rls");
  });

  it("outro kind de aviso é recusado", () => {
    expect(tenta(AGENTE, insertAviso("handoff"))).toBe("rls");
  });
});

describe("RNF-2 · a cascata de quem apaga o contato não depende do privilégio revogado", () => {
  it("manager apaga um contato que tem estado e follow-up do agente", () => {
    const contato = "0243aaaa-2222-4000-8000-000000000002";
    sql(`
      insert into public.contacts (id, organization_id, display_name)
        values ('${contato}', '${ORG}', 'Contato a apagar') on conflict do nothing;
      insert into public.lead_state (organization_id, contact_id)
        values ('${ORG}', '${contato}') on conflict do nothing;
      insert into public.cron_jobs (organization_id, contact_id, kind, next_run_at)
        values ('${ORG}', '${contato}', 'at', now());
    `);
    expect(tenta(MANAGER, conta(`delete from public.contacts where id = '${contato}'`))).toEqual({
      linhas: 1,
    });
  });
});
