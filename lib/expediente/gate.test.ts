/**
 * O gate de expediente (PRD-01 / #67) — do método HTTP ao `403 OUT_OF_WORK_HOURS` do `requireRole`.
 * O relógio é sempre injetado ou fixado; o banco é um falso que só sabe devolver `settings`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import type { AuthUser, Role } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

import { avaliarGateDeExpediente } from "./gate";
import { HEADER_METODO_HTTP, metodoEhEscrita } from "./metodo";

// O método HTTP que o proxy carimbaria. Troca-se por teste.
let metodoCarimbado: string | null = "POST";
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => {
    const h = new Headers();
    if (metodoCarimbado !== null) h.set("x-metodo-http", metodoCarimbado);
    return h;
  }),
}));
vi.mock("@/lib/auth/server", () => ({
  mfaEmDivida: vi.fn(async () => false),
  loadAuthUser: vi.fn(),
  resolveActiveOrg: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";

/** Segunda 22:00 em São Paulo: FORA de um expediente 08–18. */
const FORA = new Date("2026-07-13T22:00:00-03:00");
/** Segunda 12:00 em São Paulo: DENTRO. */
const DENTRO = new Date("2026-07-13T12:00:00-03:00");

const comercial = {
  timezone: "America/Sao_Paulo",
  windows: [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "08:00", end: "18:00" })),
};

/** Um "banco" que devolve `settings` para `organizations` e conta as leituras. */
function dbFalso(settings: unknown, opts: { falha?: boolean } = {}) {
  const leituras = { organizations: 0 };
  const db = {
    from: (tabela: string) => {
      if (tabela === "organizations") leituras.organizations++;
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              opts.falha
                ? { data: null, error: { message: "banco fora" } }
                : { data: { settings }, error: null },
          }),
        }),
      };
    },
  };
  return { db: db as never, leituras };
}

beforeEach(() => {
  vi.clearAllMocks();
  metodoCarimbado = "POST";
  vi.useFakeTimers();
  vi.setSystemTime(FORA);
});

describe("metodoEhEscrita — fail-closed", () => {
  it("GET, HEAD e OPTIONS são leitura (qualquer caixa)", () => {
    for (const m of ["GET", "HEAD", "OPTIONS", "get", " Get "]) expect(metodoEhEscrita(m)).toBe(false);
  });
  it("POST, PATCH, PUT e DELETE são escrita", () => {
    for (const m of ["POST", "PATCH", "PUT", "DELETE"]) expect(metodoEhEscrita(m)).toBe(true);
  });
  it("ausente ou desconhecido conta como ESCRITA (fail-closed)", () => {
    for (const m of [null, undefined, "", "PURGE", "TRACE"]) expect(metodoEhEscrita(m)).toBe(true);
  });
  it("o nome do cabeçalho é estável (o proxy e o gate precisam concordar)", () => {
    expect(HEADER_METODO_HTTP).toBe("x-metodo-http");
  });
});

describe("avaliarGateDeExpediente", () => {
  const base = { organizationId: ORG_ID, agora: FORA };

  it("agent + escrita + FORA do expediente ⇒ barrado, com a próxima abertura", async () => {
    const { db } = dbFalso({ business_hours: comercial });
    const r = await avaliarGateDeExpediente({ ...base, papel: "agent", db, metodo: "POST" });
    expect(r.barrado).toBe(true);
    if (r.barrado) expect(r.abreEm?.toISOString()).toBe(new Date("2026-07-14T08:00:00-03:00").toISOString());
  });

  it("agent + escrita + DENTRO do expediente ⇒ passa", async () => {
    const { db } = dbFalso({ business_hours: comercial });
    const r = await avaliarGateDeExpediente({ ...base, agora: DENTRO, papel: "agent", db, metodo: "PATCH" });
    expect(r.barrado).toBe(false);
  });

  it("LEITURA nunca é barrada e NEM custa a leitura do expediente", async () => {
    const { db, leituras } = dbFalso({ business_hours: comercial });
    for (const metodo of ["GET", "HEAD", "OPTIONS"]) {
      const r = await avaliarGateDeExpediente({ ...base, papel: "agent", db, metodo });
      expect(r.barrado).toBe(false);
    }
    expect(leituras.organizations).toBe(0);
  });

  it("manager, admin e viewer nunca são barrados e não custam leitura", async () => {
    const { db, leituras } = dbFalso({ business_hours: comercial });
    for (const papel of ["manager", "admin", "viewer"] as Role[]) {
      const r = await avaliarGateDeExpediente({ ...base, papel, db, metodo: "POST" });
      expect(r.barrado, papel).toBe(false);
    }
    expect(leituras.organizations).toBe(0);
  });

  it("rota com isenção declarada (motivo escrito) não barra, nem lê o expediente", async () => {
    const { db, leituras } = dbFalso({ business_hours: comercial });
    const r = await avaliarGateDeExpediente({
      ...base,
      papel: "agent",
      db,
      metodo: "PATCH",
      isencao: { isenta: "o atendente gerencia a própria disponibilidade" },
    });
    expect(r.barrado).toBe(false);
    expect(leituras.organizations).toBe(0);
  });

  it("método ausente (proxy não carimbou) é tratado como escrita: barra fora do expediente", async () => {
    const { db } = dbFalso({ business_hours: comercial });
    const r = await avaliarGateDeExpediente({ ...base, papel: "agent", db, metodo: null });
    expect(r.barrado).toBe(true);
  });

  it("FALHA ABERTA: sem expediente, expediente torto ou banco fora ⇒ nunca barra", async () => {
    for (const settings of [{}, null, { business_hours: { timezone: "Marte/Olympus", windows: [] } }, { business_hours: "8 às 18" }]) {
      const { db } = dbFalso(settings);
      const r = await avaliarGateDeExpediente({ ...base, papel: "agent", db, metodo: "POST" });
      expect(r.barrado, JSON.stringify(settings)).toBe(false);
    }
    const { db } = dbFalso({ business_hours: comercial }, { falha: true });
    expect((await avaliarGateDeExpediente({ ...base, papel: "agent", db, metodo: "POST" })).barrado).toBe(false);
  });
});

function sessao(role: Role, settings: unknown, opts: { platformAdmin?: boolean; support?: boolean } = {}) {
  const user: AuthUser = {
    id: USER_ID,
    email: "u@example.com",
    full_name: null,
    avatar_url: null,
    is_platform_admin: opts.platformAdmin ?? false,
    idioma: "pt-BR",
    organizations: [{ organization_id: ORG_ID, organization_name: "Org", role }],
    ...(opts.support
      ? { support: { status: "active", organization_id: ORG_ID, name: "Org", access_mode: "full" } }
      : {}),
  } as AuthUser;
  vi.mocked(loadAuthUser).mockResolvedValue(user);
  vi.mocked(resolveActiveOrg).mockResolvedValue({ orgId: ORG_ID, name: "Org", role });
  const { db, leituras } = dbFalso(settings);
  vi.mocked(createClient).mockResolvedValue({
    rpc: vi.fn(async () => ({ data: role, error: null })),
    from: (db as { from: (t: string) => unknown }).from,
  } as never);
  return leituras;
}

describe("requireRole + expediente (ponta a ponta, relógio fixado em segunda 22:00 BRT)", () => {
  it("CA-1 · agent às 22h com expediente 08–18, numa escrita: 403 OUT_OF_WORK_HOURS com opens_at", async () => {
    sessao("agent", { business_hours: comercial });
    const r = await requireRole("agent", { requestId: "req-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(403);
      const corpo = (await r.response.json()) as { error: { code: string; message: string; details: { opens_at: string } } };
      expect(corpo.error.code).toBe("OUT_OF_WORK_HOURS");
      expect(corpo.error.details.opens_at).toBe(new Date("2026-07-14T08:00:00-03:00").toISOString());
      expect(corpo.error.message).toMatch(/expediente/i);
    }
  });

  it("a MESMA sessão faz uma LEITURA (GET) e passa: o expediente bloqueia ação, não leitura", async () => {
    sessao("agent", { business_hours: comercial });
    metodoCarimbado = "GET";
    const r = await requireRole("agent", { requestId: "req-2" });
    expect(r.ok).toBe(true);
  });

  it("dentro do expediente a escrita passa", async () => {
    sessao("agent", { business_hours: comercial });
    vi.setSystemTime(DENTRO);
    expect((await requireRole("agent")).ok).toBe(true);
  });

  it("rota que declara isenção passa fora do expediente", async () => {
    sessao("agent", { business_hours: comercial });
    const r = await requireRole("agent", { expediente: { isenta: "o atendente gerencia a própria disponibilidade" } });
    expect(r.ok).toBe(true);
  });

  it("RNF-1 · manager, admin, platform admin e sessão de suporte NUNCA são barrados", async () => {
    for (const role of ["manager", "admin"] as Role[]) {
      sessao(role, { business_hours: comercial });
      expect((await requireRole("agent")).ok, role).toBe(true);
    }
    sessao("agent", { business_hours: comercial }, { platformAdmin: true });
    expect((await requireRole("agent")).ok, "platform admin").toBe(true);
    sessao("agent", { business_hours: comercial }, { support: true });
    expect((await requireRole("agent")).ok, "suporte").toBe(true);
  });

  it("sem expediente configurado NADA muda para o agent (instalação que atualiza continua operando)", async () => {
    sessao("agent", {});
    expect((await requireRole("agent")).ok).toBe(true);
  });

  it("quem não tem o papel mínimo continua levando 403 forbidden_role, não OUT_OF_WORK_HOURS", async () => {
    sessao("agent", { business_hours: comercial });
    const r = await requireRole("manager");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(((await r.response.json()) as { error: { code: string } }).error.code).toBe("forbidden_role");
  });

  it("membro REVOGADO (JWT ainda válido): 403 forbidden_role e o gate NEM CHEGA a ler o expediente", async () => {
    // Review do #88, item 2: o gate só vê quem `fn_user_role_in_org` reconhece. Revogado devolve
    // vazio ⇒ rank 0 ⇒ barrado por PAPEL antes do gate, então a RLS esconder a linha dele não vira
    // "falha aberta silenciosa". A prova é que `organizations` não foi lida.
    const leituras = sessao("agent", { business_hours: comercial });
    vi.mocked(createClient).mockResolvedValue({
      rpc: vi.fn(async () => ({ data: null, error: null })),
      from: (tabela: string) => {
        if (tabela === "organizations") leituras.organizations++;
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      },
    } as never);
    const r = await requireRole("agent", { requestId: "req-revogado" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(403);
      expect(((await r.response.json()) as { error: { code: string } }).error.code).toBe("forbidden_role");
    }
    expect(leituras.organizations, "o gate não pode ter lido o expediente").toBe(0);
  });

  it("N4 · a tentativa barrada NÃO grava linha de audit (retry/polling não inflam o log)", async () => {
    sessao("agent", { business_hours: comercial });
    for (let i = 0; i < 5; i++) await requireRole("agent");
    expect(vi.mocked(audit)).not.toHaveBeenCalled();
  });
});
