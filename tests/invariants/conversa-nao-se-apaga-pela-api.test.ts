import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { countAs, sql } from "./gov-helpers";

/**
 * CONVERSA NÃO SE APAGA PELA API (#99, spec `docs/specs/sdd/99-conversa-nao-se-apaga/`, migration 0240).
 *
 * Lê o Postgres descartável que nasce do `supabase/baseline.sql` (`TEST_DB_CONTAINER`, via
 * `scripts/test-db.sh`), nunca o banco de dev. O JWT é o de gente de verdade (papel `authenticated` +
 * `request.jwt.claims`), não o superusuário, que tem `rolbypassrls` e passaria em tudo.
 *
 * O que está sob prova, e por que cada coisa importa:
 *
 *  1. **CA-1 — ninguém apaga conversa pelo PostgREST.** `DELETE` em `conversations` é negado por
 *     PRIVILÉGIO (`permission denied`), não só por RLS: se uma policy permissiva de `DELETE` voltar por
 *     engano, a trava continua. O `service_role` (cron, workers, cascade de LGPD) segue apagando.
 *  2. **CA-2 — o log de mensagens é só de `agent`+ em conversa visível.** Antes, `messages_update` e
 *     `messages_delete` exigiam só pertencer à organização: um `viewer` editava e apagava mensagem que
 *     enxergava. A leitura não muda; a barreira é de escrita.
 *  3. **CA-10 — o fluxo de envio NÃO quebra.** `agent` e a sessão de suporte `full` (papel efetivo
 *     `admin`) inserem, marcam `failed`, reenviam e removem o eco `external_device`. Apertar a escrita
 *     de `messages` sem este par derrubaria o envio de toda instalação, com o gate verde.
 *  4. **CA-3b — contato só com compromisso continua recusado pelo banco** (`RESTRICT`), e quem não tem
 *     nada se apaga. É o que sustenta o 409 do handler.
 *
 * Cada caso cria o PRÓPRIO contato, conversa e mensagem: um `DELETE` que PASSA (estado vermelho) não
 * pode apagar o cenário do caso seguinte.
 *
 * Arquivo NOVO de propósito: `tests/invariants/**` é congelado contra modificação.
 */

// Namespace pela MIGRATION (`0240`): os invariantes rodam em PARALELO contra o MESMO container.
const ORG = "0240aaaa-0000-4000-8000-000000000001";
const SESSAO_CANAL = "0240aaaa-2222-4000-8000-000000000001";
const VIEWER = "0240aaaa-1111-4000-8000-000000000001";
const AGENTE = "0240aaaa-1111-4000-8000-000000000002"; // titular das conversas "do titular"
const OUTRO_AGENTE = "0240aaaa-1111-4000-8000-000000000003";
const MANAGER = "0240aaaa-1111-4000-8000-000000000004";
const ADMIN = "0240aaaa-1111-4000-8000-000000000005";
const SUPORTE = "0240aaaa-1111-4000-8000-000000000006"; // platform admin, SEM membership na org
const SESSAO_AUTH = "0240aaaa-3333-4000-8000-000000000001";
const SESSAO_SUPORTE = "0240aaaa-3333-4000-8000-000000000002";

type Resultado = { linhas: number } | { negado: true };

/**
 * Roda um DML como o usuário (papel `authenticated` + claims) e devolve as linhas afetadas.
 * Dois "não" diferentes, e o teste precisa distingui-los:
 *  - RLS que filtra (0 linhas, sem erro) ou `with check` violado → `{ linhas: 0 }`;
 *  - falta de PRIVILÉGIO (`permission denied for table`) → `{ negado: true }`.
 * Qualquer outro erro relança: não é uma resposta, é um defeito do teste.
 */
function como(userId: string, dml: string, claimsExtra = ""): Resultado {
  try {
    const out = sql(`
      set role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${userId}"${claimsExtra}}', false);
      with w as (${dml} returning 1) select count(*) from w;
    `);
    const ultima = out.split("\n").pop() ?? "";
    if (!/^\d+$/.test(ultima)) throw new Error(`saída inesperada do psql: ${out}`);
    return { linhas: Number(ultima) };
  } catch (err) {
    const stderr = String((err as { stderr?: Buffer | string }).stderr ?? "");
    if (stderr.includes("permission denied")) return { negado: true };
    if (stderr.includes("row-level security")) return { linhas: 0 };
    throw err;
  }
}

const SUPORTE_FULL = `,"session_id":"${SESSAO_AUTH}","aal":"aal1"`;

/** Como o `service_role` (cron, workers, cascade de LGPD): sem RLS por construção. */
function comoServico(dml: string): number {
  const out = sql(`
    set role service_role;
    with w as (${dml} returning 1) select count(*) from w;
  `);
  return Number(out.split("\n").pop());
}

/** Contato + conversa NOVOS; `titular` null = conversa da fila (sem dono). */
function novaConversa(titular: string | null): { conversa: string; contato: string } {
  const conversa = randomUUID();
  const contato = randomUUID();
  sql(`
    insert into public.contacts (id, organization_id, display_name)
      values ('${contato}', '${ORG}', 'Caso ${contato.slice(0, 8)}');
    insert into public.conversations
      (id, organization_id, contact_id, channel_session_id, status, assigned_to_user_id)
      values ('${conversa}', '${ORG}', '${contato}', '${SESSAO_CANAL}', 'open',
              ${titular ? `'${titular}'` : "null"});
  `);
  return { conversa, contato };
}

/** Mensagem NOVA (superusuário) numa conversa, para o caso mexer nela. */
function novaMensagem(c: { conversa: string; contato: string }, body = "original"): string {
  const id = randomUUID();
  sql(`
    insert into public.messages
      (id, organization_id, conversation_id, channel_session_id, contact_id, type, direction, status, body)
      values ('${id}', '${ORG}', '${c.conversa}', '${SESSAO_CANAL}', '${c.contato}', 'text', 'outbound', 'sent', '${body}');
  `);
  return id;
}

function conversaExiste(id: string): boolean {
  return sql(`select count(*) from public.conversations where id = '${id}'`) === "1";
}

function semear(): void {
  sql(`
    insert into auth.users (id, email) values
      ('${VIEWER}', 'cna-viewer@invariant.test'),
      ('${AGENTE}', 'cna-agente@invariant.test'),
      ('${OUTRO_AGENTE}', 'cna-outro-agente@invariant.test'),
      ('${MANAGER}', 'cna-manager@invariant.test'),
      ('${ADMIN}', 'cna-admin@invariant.test'),
      ('${SUPORTE}', 'cna-suporte@invariant.test')
      on conflict do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG}', 'cna-inv', 'Conversa Nao Se Apaga Inv', 'CNA Inv')
      on conflict do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${VIEWER}', '${ORG}', 'viewer', now()),
      ('${AGENTE}', '${ORG}', 'agent', now()),
      ('${OUTRO_AGENTE}', '${ORG}', 'agent', now()),
      ('${MANAGER}', '${ORG}', 'manager', now()),
      ('${ADMIN}', '${ORG}', 'admin', now())
      on conflict do nothing;
    -- DO + exception (não ON CONFLICT): channel_sessions tem unique DEFERRABLE.
    do $cna$ begin
      insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
        values ('${SESSAO_CANAL}', '${ORG}', 'cna-inv', '\\x00'::bytea);
    exception when unique_violation then null; end $cna$;

    -- Sessão de suporte FULL, como as sondas reais: platform admin sem membership na org, com
    -- auth.sessions e platform_support_sessions de verdade. O papel efetivo dela é 'admin'.
    insert into auth.sessions (id, user_id, aal) values ('${SESSAO_AUTH}', '${SUPORTE}', 'aal1')
      on conflict do nothing;
    insert into public.platform_admins (user_id, granted_by, scope, mfa_required, reason)
      values ('${SUPORTE}', '${SUPORTE}', 'full', false, 'invariante conversa-nao-se-apaga')
      on conflict do nothing;
    insert into public.platform_support_sessions
      (id, organization_id, actor_user_id, auth_session_id, access_mode, expires_at)
      values ('${SESSAO_SUPORTE}', '${ORG}', '${SUPORTE}', '${SESSAO_AUTH}', 'full', now() + interval '6 hours')
      on conflict do nothing;
  `);
}

beforeAll(() => {
  semear();
});

describe("CA-1 · ninguém apaga conversa pelo PostgREST (RF-1)", () => {
  it("o privilégio de DELETE em conversations não existe para authenticated nem anon", () => {
    expect(sql(`select has_table_privilege('authenticated', 'public.conversations', 'delete')`)).toBe("f");
    expect(sql(`select has_table_privilege('anon', 'public.conversations', 'delete')`)).toBe("f");
  });

  it("a policy conversations_agent_delete não existe", () => {
    expect(
      sql(`select count(*) from pg_policies
            where schemaname = 'public' and tablename = 'conversations' and cmd = 'DELETE'
              and permissive = 'PERMISSIVE'`),
    ).toBe("0");
  });

  it.each([
    ["viewer", VIEWER],
    ["agent", AGENTE],
    ["manager", MANAGER],
    ["admin", ADMIN],
  ])("%s é barrado ao apagar conversa do titular, e a conversa continua lá", (_papel, quem) => {
    const c = novaConversa(AGENTE);
    expect(como(quem, `delete from public.conversations where id = '${c.conversa}'`)).toEqual({ negado: true });
    expect(conversaExiste(c.conversa)).toBe(true);
  });

  it.each([
    ["viewer", VIEWER],
    ["agent", AGENTE],
    ["manager", MANAGER],
    ["admin", ADMIN],
  ])("%s é barrado ao apagar conversa da fila (sem dono)", (_papel, quem) => {
    const c = novaConversa(null);
    expect(como(quem, `delete from public.conversations where id = '${c.conversa}'`)).toEqual({ negado: true });
    expect(conversaExiste(c.conversa)).toBe(true);
  });

  it("PAR: o service_role (cron, workers, LGPD) apaga 1 linha", () => {
    const c = novaConversa(null);
    expect(comoServico(`delete from public.conversations where id = '${c.conversa}'`)).toBe(1);
    expect(conversaExiste(c.conversa)).toBe(false);
  });
});

describe("CA-2 · o log de mensagens é só de agent+ em conversa visível (RF-2)", () => {
  it("o viewer LÊ a mensagem da conversa que enxerga (a barreira é de escrita)", () => {
    const c = novaConversa(AGENTE);
    const m = novaMensagem(c);
    expect(countAs(VIEWER, `select count(*) from public.messages where id = '${m}'`)).toBe(1);
  });

  it("o viewer NÃO edita nem apaga mensagem de conversa que enxerga (0 linhas)", () => {
    const c = novaConversa(AGENTE);
    const m = novaMensagem(c);
    expect(como(VIEWER, `update public.messages set body = 'adulterada' where id = '${m}'`)).toEqual({ linhas: 0 });
    expect(como(VIEWER, `delete from public.messages where id = '${m}'`)).toEqual({ linhas: 0 });
    expect(sql(`select body from public.messages where id = '${m}'`)).toBe("original");
  });

  it.each([
    ["agent titular", AGENTE],
    ["manager", MANAGER],
    ["admin", ADMIN],
  ])("PAR: %s edita e apaga mensagem de conversa visível (1 linha cada)", (_papel, quem) => {
    const c = novaConversa(AGENTE);
    const m = novaMensagem(c);
    expect(como(quem, `update public.messages set body = 'corrigida' where id = '${m}'`)).toEqual({ linhas: 1 });
    expect(como(quem, `delete from public.messages where id = '${m}'`)).toEqual({ linhas: 1 });
  });

  it("agent NÃO edita nem apaga mensagem de conversa que NÃO enxerga (de outro titular)", () => {
    const c = novaConversa(AGENTE); // visibility_mode padrão: own_and_unassigned → o OUTRO agent não a vê
    const m = novaMensagem(c);
    expect(countAs(OUTRO_AGENTE, `select count(*) from public.messages where id = '${m}'`)).toBe(0);
    expect(como(OUTRO_AGENTE, `update public.messages set body = 'x' where id = '${m}'`)).toEqual({ linhas: 0 });
    expect(como(OUTRO_AGENTE, `delete from public.messages where id = '${m}'`)).toEqual({ linhas: 0 });
  });

  it("PAR: o mesmo agent edita e apaga mensagem de conversa da fila, que enxerga", () => {
    const c = novaConversa(null);
    const m = novaMensagem(c);
    expect(como(OUTRO_AGENTE, `update public.messages set body = 'x' where id = '${m}'`)).toEqual({ linhas: 1 });
    expect(como(OUTRO_AGENTE, `delete from public.messages where id = '${m}'`)).toEqual({ linhas: 1 });
  });
});

describe("CA-10 · o fluxo de envio continua funcionando (RF-2b)", () => {
  function inserir(quem: string, c: { conversa: string; contato: string }, id: string, extra = "", via = "crm"): Resultado {
    return como(
      quem,
      `insert into public.messages
         (id, organization_id, conversation_id, channel_session_id, contact_id, type, direction, status, sent_via, body)
         values ('${id}', '${ORG}', '${c.conversa}', '${SESSAO_CANAL}', '${c.contato}', 'text', 'outbound', 'queued', '${via}', 'oi')`,
      extra,
    );
  }

  it("agent: insere, marca failed, reenvia (sent) e apaga o eco external_device — 1 linha cada", () => {
    const c = novaConversa(AGENTE);
    const id = randomUUID();
    expect(inserir(AGENTE, c, id)).toEqual({ linhas: 1 });
    expect(como(AGENTE, `update public.messages set status = 'failed' where id = '${id}'`)).toEqual({ linhas: 1 });
    expect(como(AGENTE, `update public.messages set status = 'sent' where id = '${id}'`)).toEqual({ linhas: 1 });
    const eco = randomUUID();
    expect(inserir(AGENTE, c, eco, "", "external_device")).toEqual({ linhas: 1 });
    expect(como(AGENTE, `delete from public.messages where id = '${eco}'`)).toEqual({ linhas: 1 });
  });

  it("sessão de suporte FULL (papel efetivo admin, sem membership): insere, failed, sent", () => {
    const c = novaConversa(AGENTE);
    const id = randomUUID();
    expect(inserir(SUPORTE, c, id, SUPORTE_FULL)).toEqual({ linhas: 1 });
    expect(como(SUPORTE, `update public.messages set status = 'failed' where id = '${id}'`, SUPORTE_FULL)).toEqual({ linhas: 1 });
    expect(como(SUPORTE, `update public.messages set status = 'sent' where id = '${id}'`, SUPORTE_FULL)).toEqual({ linhas: 1 });
  });

  it("controle: o viewer edita 0", () => {
    const c = novaConversa(AGENTE);
    const m = novaMensagem(c);
    expect(como(VIEWER, `update public.messages set status = 'failed' where id = '${m}'`)).toEqual({ linhas: 0 });
  });
});

describe("CA-3b · o banco recusa apagar contato com histórico ou compromisso (sustenta o 409)", () => {
  it("contato SÓ com compromisso (sem conversa): o DELETE falha pela FK e o contato permanece", () => {
    const contato = randomUUID();
    sql(`
      insert into public.contacts (id, organization_id, display_name) values ('${contato}', '${ORG}', 'So Compromisso');
      insert into public.calendar_appointments
        (organization_id, contact_id, owner_user_id, title, starts_at, ends_at, status)
        values ('${ORG}', '${contato}', '${ADMIN}', 'Consulta', '2026-03-10 14:00:00+00', '2026-03-10 15:00:00+00', 'completed');
    `);
    let erro = "";
    try {
      sql(`delete from public.contacts where id = '${contato}'`);
    } catch (e) {
      erro = String((e as { stderr?: Buffer | string }).stderr ?? "");
    }
    expect(erro).toContain("calendar_appointments_contact_id_fkey");
    expect(sql(`select count(*) from public.contacts where id = '${contato}'`)).toBe("1");
  });

  it("contato com conversa: o DELETE falha pela FK, e a conversa e a mensagem permanecem", () => {
    const c = novaConversa(AGENTE);
    const m = novaMensagem(c);
    let erro = "";
    try {
      sql(`delete from public.contacts where id = '${c.contato}'`);
    } catch (e) {
      erro = String((e as { stderr?: Buffer | string }).stderr ?? "");
    }
    expect(erro).toMatch(/violates foreign key constraint/);
    expect(conversaExiste(c.conversa)).toBe(true);
    expect(sql(`select count(*) from public.messages where id = '${m}'`)).toBe("1");
  });

  it("PAR: contato sem conversa e sem compromisso se apaga", () => {
    const contato = randomUUID();
    sql(`insert into public.contacts (id, organization_id, display_name) values ('${contato}', '${ORG}', 'Livre')`);
    sql(`delete from public.contacts where id = '${contato}'`);
    expect(sql(`select count(*) from public.contacts where id = '${contato}'`)).toBe("0");
  });
});
