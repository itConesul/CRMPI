import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O aviso de proposta ambígua é gravado com a sessão de quem abre o quadro. Desde a #141 o banco só
 * aceita esse `insert` de `agent`+: para um `viewer` ele volta `42501`. O quadro continua abrindo, e a
 * recusa não pode sumir calada.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const FUNIL = "22222222-2222-4222-8222-222222222222";
const CONTATO = "33333333-3333-4333-8333-333333333333";

const lead = (id: string) => ({
  id,
  organization_id: ORG,
  pipeline_id: FUNIL,
  contact_id: CONTATO,
  status: "open",
  owner_kind: "user",
  last_activity_at: "2026-11-27T10:00:00Z",
  created_at: "2026-11-27T09:00:00Z",
});

const TABELAS: Record<string, unknown> = {
  crm_pipelines: [{ id: FUNIL, organization_id: ORG }],
  crm_leads: [lead("lead-1"), lead("lead-2")],
  lead_state: [
    { contact_id: CONTATO, next_action: "ligar amanhã", next_action_seq: 1, updated_at: "2026-11-27T10:00:00Z" },
  ],
};

let erroDoInsert: { code: string; message: string } | null = null;
const inseridos: unknown[] = [];

function consulta(tabela: string) {
  const linhas = (TABELAS[tabela] ?? []) as unknown[];
  let resposta: { data: unknown; error: unknown } = { data: linhas, error: null };
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "in", "not", "order", "is", "limit", "gt", "gte"]) {
    q[m] = () => q;
  }
  q.insert = (valores: unknown) => {
    inseridos.push(valores);
    resposta = { data: null, error: erroDoInsert };
    return q;
  };
  q.maybeSingle = () => Promise.resolve({ data: linhas[0] ?? null, error: null });
  q.then = (ok: (v: unknown) => unknown, nok: (e: unknown) => unknown) =>
    Promise.resolve(resposta).then(ok, nok);
  return q;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u-1" } }, error: null }) },
    from: consulta,
  }),
}));
vi.mock("@/lib/auth/server", () => ({ loadAuthUser: async () => null }));

const aviso = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: aviso, error: vi.fn(), debug: vi.fn() },
}));

async function abreQuadro(): Promise<Response> {
  const { GET } = await import("@/app/api/v1/pipelines/[id]/board/route");
  return GET(new Request("http://localhost/api/v1/pipelines/x/board") as never, {
    params: Promise.resolve({ id: FUNIL }),
  });
}

beforeEach(() => {
  erroDoInsert = null;
  inseridos.length = 0;
  aviso.mockClear();
});

describe("aviso de proposta ambígua no quadro", () => {
  it("recusado pelo banco: o quadro abre e a recusa vai para o log, sem o texto da proposta", async () => {
    erroDoInsert = { code: "42501", message: "new row violates row-level security policy" };

    const resposta = await abreQuadro();

    expect(resposta.status).toBe(200);
    expect(inseridos).toHaveLength(1);
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(aviso.mock.calls[0]?.[1]).toMatchObject({ organization_id: ORG, code: "42501" });
    expect(JSON.stringify(aviso.mock.calls)).not.toContain("ligar amanhã");
  });

  it("gravado: nada no log", async () => {
    const resposta = await abreQuadro();

    expect(resposta.status).toBe(200);
    expect(inseridos).toHaveLength(1);
    expect(aviso).not.toHaveBeenCalled();
  });
});
