import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * NOTAS INTERNAS: SÓ QUEM VÊ A CONVERSA, E EM TEMPO REAL (#137, spec
 * `docs/specs/sdd/137-notas-internas-visibilidade-e-realtime/`, migration 0244).
 *
 * A leitura de `conversation_notes` só exigia ser da organização, e a tabela não estava na publicação do
 * Realtime. Publicar sem apertar empurraria o texto da nota ao navegador de quem não vê a conversa.
 *
 *  - CA-1: lê quem é `agent`+ e vê a conversa; agente sem acesso, `viewer` e outra organização não.
 *  - CA-2: a tabela está na publicação, com RLS ligada.
 *  - CA-3: o dono insere com `RETURNING` (o que a rota faz) e apaga; `viewer` não.
 *  - CA-4: quem não vê a conversa não insere, não altera e não apaga, com ou sem filtro.
 *
 * Toda tentativa roda em transação desfeita, e o efeito é conferido como dono do banco: no estado
 * vermelho a escrita PASSA, e não pode levar embora o cenário do caso seguinte.
 */

const ORG = "0244aaaa-0000-4000-8000-000000000001";
const ORG_B = "0244aaaa-0000-4000-8000-0000000000b1";
const DONO = "0244aaaa-1111-4000-8000-000000000001"; // agent com a conversa atribuída
const OUTRO = "0244aaaa-1111-4000-8000-000000000002"; // agent da mesma organização, sem a conversa
const VIEWER = "0244aaaa-1111-4000-8000-000000000003";
const MANAGER = "0244aaaa-1111-4000-8000-000000000004";
const DE_FORA = "0244aaaa-1111-4000-8000-0000000000b2"; // manager só da ORG_B
const SUPORTE = "0244aaaa-1111-4000-8000-000000000005"; // administrador de plataforma
const SESSAO_AUTH = "0244aaaa-5555-4000-8000-000000000001";
const CONTATO = "0244aaaa-2222-4000-8000-000000000001";
const CANAL = "0244aaaa-3333-4000-8000-000000000001";
const CONVERSA = "0244aaaa-4444-4000-8000-000000000001";
const NOTA = "0244aaaa-6666-4000-8000-000000000001";

type Opcoes = {
  /** Roda como dono do banco, dentro da mesma transação, antes de assumir o papel. */
  antes?: string;
  /** Claims extras do JWT (a sessão de suporte precisa de `session_id`). */
  sessao?: string;
};

/**
 * Executa `comando` como `authenticated`, volta a ser dono do banco, mede com `sonda` e DESFAZ.
 * A sonda não passa por RLS: mede o que de fato aconteceu, mesmo quando quem escreveu não pode ler.
 */
function tenta(userId: string, comando: string, sonda: string, op: Opcoes = {}): string {
  const claims = op.sessao
    ? `{"sub":"${userId}","session_id":"${op.sessao}","aal":"aal1"}`
    : `{"sub":"${userId}"}`;
  try {
    const out = sql(`
      begin;
      ${op.antes ?? ""}
      select set_config('request.jwt.claims', '${claims}', true);
      set local role authenticated;
      ${comando};
      reset role;
      select 'sonda=' || (${sonda});
      rollback;
    `);
    const linha = out.split("\n").find((l) => l.startsWith("sonda="));
    if (linha === undefined) throw new Error(`saída inesperada: ${out}`);
    return linha.slice("sonda=".length);
  } catch (err) {
    const stderr = String((err as { stderr?: Buffer | string }).stderr ?? "");
    if (stderr.includes("row-level security")) return "recusado";
    throw err;
  }
}

/** Quantas vezes a nota semeada aparece para quem consulta. */
function le(userId: string, op: Opcoes = {}): number {
  const claims = op.sessao
    ? `{"sub":"${userId}","session_id":"${op.sessao}","aal":"aal1"}`
    : `{"sub":"${userId}"}`;
  const out = sql(`
    begin;
    ${op.antes ?? ""}
    select set_config('request.jwt.claims', '${claims}', true);
    set local role authenticated;
    select 'lidas=' || count(*) from public.conversation_notes where id = '${NOTA}';
    rollback;
  `);
  const linha = out.split("\n").find((l) => l.startsWith("lidas="));
  if (linha === undefined) throw new Error(`saída inesperada: ${out}`);
  return Number(linha.slice("lidas=".length));
}

const NOVA = "nota nova do teste";
const inserir = (autor: string, retorno = "") =>
  `insert into public.conversation_notes (organization_id, conversation_id, body, created_by_user_id)
   values ('${ORG}', '${CONVERSA}', '${NOVA}', '${autor}') ${retorno}`;
const novasGravadas = `select count(*) from public.conversation_notes where body = '${NOVA}'`;
const corpoDaNota = `select body from public.conversation_notes where id = '${NOTA}'`;
const notaExiste = `select count(*) from public.conversation_notes where id = '${NOTA}'`;

const modo = (m: "all" | "none") =>
  `update public.organizations set settings = jsonb_set(coalesce(settings, '{}'), '{visibility_mode}', '"${m}"')
    where id = '${ORG}';`;

const suporte = (m: "full" | "support_readonly"): Opcoes => ({
  sessao: SESSAO_AUTH,
  antes: `select public.fn_start_support('${SUPORTE}', '${SESSAO_AUTH}', '${ORG}', null, '${m}', 3600);`,
});

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${DONO}', 'nin-dono@invariant.test'),
      ('${OUTRO}', 'nin-outro@invariant.test'),
      ('${VIEWER}', 'nin-viewer@invariant.test'),
      ('${MANAGER}', 'nin-manager@invariant.test'),
      ('${DE_FORA}', 'nin-de-fora@invariant.test'),
      ('${SUPORTE}', 'nin-suporte@invariant.test')
      on conflict do nothing;
    insert into auth.sessions (id, user_id, aal)
      values ('${SESSAO_AUTH}', '${SUPORTE}', 'aal1') on conflict do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG}', 'nin-inv', 'Notas Internas Inv', 'NIN Inv'),
      ('${ORG_B}', 'nin-inv-b', 'Notas Internas Inv B', 'NIN Inv B')
      on conflict do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${DONO}', '${ORG}', 'agent', now()),
      ('${OUTRO}', '${ORG}', 'agent', now()),
      ('${VIEWER}', '${ORG}', 'viewer', now()),
      ('${MANAGER}', '${ORG}', 'manager', now()),
      ('${DE_FORA}', '${ORG_B}', 'manager', now())
      on conflict do nothing;
    insert into public.platform_admins (user_id, granted_by, scope, mfa_required, reason)
      values ('${SUPORTE}', '${SUPORTE}', 'full', false, 'invariante das notas') on conflict do nothing;
    insert into public.contacts (id, organization_id, display_name)
      values ('${CONTATO}', '${ORG}', 'Contato NIN') on conflict do nothing;
    -- DO + exception (não ON CONFLICT): channel_sessions tem unique DEFERRABLE.
    do $nin$ begin
      insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
        values ('${CANAL}', '${ORG}', 'nin-inv', '\\x00'::bytea);
    exception when unique_violation then null; end $nin$;
    insert into public.conversations (id, organization_id, contact_id, channel_session_id, status, assigned_to_user_id)
      values ('${CONVERSA}', '${ORG}', '${CONTATO}', '${CANAL}', 'open', '${DONO}') on conflict do nothing;
    insert into public.conversation_notes (id, organization_id, conversation_id, body, created_by_user_id)
      values ('${NOTA}', '${ORG}', '${CONVERSA}', 'texto original', '${DONO}') on conflict do nothing;
  `);
});

describe("CA-1 · só lê a nota quem é agent+ e vê a conversa", () => {
  it("o agente dono da conversa lê", () => expect(le(DONO)).toBe(1));
  it("o manager lê", () => expect(le(MANAGER)).toBe(1));
  it("o agente que não vê a conversa NÃO lê", () => expect(le(OUTRO)).toBe(0));
  it("o viewer NÃO lê, embora veja a conversa", () => expect(le(VIEWER)).toBe(0));
  it("outra organização NÃO lê", () => expect(le(DE_FORA)).toBe(0));
  it("com visibility_mode all, o outro agente passa a ler", () =>
    expect(le(OUTRO, { antes: modo("all") })).toBe(1));
  it("com visibility_mode none, o outro agente NÃO lê e o dono lê", () => {
    expect(le(OUTRO, { antes: modo("none") })).toBe(0);
    expect(le(DONO, { antes: modo("none") })).toBe(1);
  });
  it("a sessão de suporte, completa ou somente leitura, lê", () => {
    expect(le(SUPORTE, suporte("full"))).toBe(1);
    expect(le(SUPORTE, suporte("support_readonly"))).toBe(1);
  });
});

describe("CA-2 · a tabela está publicada, com RLS", () => {
  it("conversation_notes está em supabase_realtime", () => {
    expect(
      sql(`select count(*) from pg_publication_tables
            where pubname = 'supabase_realtime' and schemaname = 'public'
              and tablename = 'conversation_notes';`),
    ).toBe("1");
  });
  it("a RLS está ligada", () => {
    expect(
      sql(`select relrowsecurity from pg_class where oid = 'public.conversation_notes'::regclass;`),
    ).toBe("t");
  });
  it("nenhuma política permissiva FOR ALL sobra (ela concederia leitura)", () => {
    expect(
      sql(`select count(*) from pg_policy
            where polrelid = 'public.conversation_notes'::regclass and polpermissive and polcmd = '*';`),
    ).toBe("0");
  });
});

describe("CA-3 · quem usa a tela continua criando e apagando", () => {
  it.each([
    ["dono", DONO],
    ["manager", MANAGER],
  ])("o %s insere com RETURNING", (_n, quem) => {
    expect(tenta(quem, inserir(quem, "returning id, body"), novasGravadas)).toBe("1");
  });
  it.each([
    ["dono", DONO],
    ["manager", MANAGER],
  ])("o %s apaga a nota", (_n, quem) => {
    expect(tenta(quem, `delete from public.conversation_notes where id = '${NOTA}'`, notaExiste)).toBe("0");
  });
  it("o viewer não insere", () => {
    expect(tenta(VIEWER, inserir(VIEWER), novasGravadas)).toBe("recusado");
  });
  it("o viewer não altera nem apaga", () => {
    expect(tenta(VIEWER, `update public.conversation_notes set body = 'x'`, corpoDaNota)).toBe("texto original");
    expect(tenta(VIEWER, `delete from public.conversation_notes`, notaExiste)).toBe("1");
  });
  it("o suporte completo insere; o somente leitura não", () => {
    expect(tenta(SUPORTE, inserir(SUPORTE), novasGravadas, suporte("full"))).toBe("1");
    expect(tenta(SUPORTE, inserir(SUPORTE), novasGravadas, suporte("support_readonly"))).toBe("recusado");
  });
});

describe("CA-4 · quem não vê a conversa não escreve nela", () => {
  it.each([
    ["o agente sem acesso", OUTRO],
    ["outra organização", DE_FORA],
  ])("%s não insere, sem RETURNING", (_n, quem) => {
    expect(tenta(quem, inserir(quem), novasGravadas)).toBe("recusado");
  });
  it("o agente sem acesso não insere, com RETURNING", () => {
    expect(tenta(OUTRO, inserir(OUTRO, "returning id"), novasGravadas)).toBe("recusado");
  });
  // Sem WHERE, o Postgres não aplica a política de leitura: quem barra é a de update/delete.
  it("o update sem filtro não altera a nota", () => {
    expect(tenta(OUTRO, `update public.conversation_notes set body = 'x'`, corpoDaNota)).toBe("texto original");
  });
  it("o update com filtro não altera a nota", () => {
    expect(
      tenta(OUTRO, `update public.conversation_notes set body = 'x' where id = '${NOTA}'`, corpoDaNota),
    ).toBe("texto original");
  });
  it("o delete sem filtro não apaga a nota", () => {
    expect(tenta(OUTRO, `delete from public.conversation_notes`, notaExiste)).toBe("1");
  });
  it("o delete com filtro não apaga a nota", () => {
    expect(tenta(OUTRO, `delete from public.conversation_notes where id = '${NOTA}'`, notaExiste)).toBe("1");
  });
});
