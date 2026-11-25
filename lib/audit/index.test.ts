/**
 * `audit()` ponta a ponta dentro do processo (PRD-01 / #67, T2c, RF-10): a linha de `api_audit_log`
 * sai com `metadata.fora_do_expediente = true` quando `admin`/`manager` (ou suporte, ou platform admin)
 * agem fora do expediente — e só então. Os clients do Supabase são falsos; o carregador do expediente,
 * o cache, a decisão e a ordem das chamadas são os REAIS.
 *
 * A prova com banco e requisição reais está em `tests/e2e/expediente-audit-fora-do-horario.spec.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __limparCacheDoAuditParaTeste, falhasDaMarcaNoDia } from "@/lib/expediente/cache-do-audit";
import { lerMetodoDaRequisicao } from "@/lib/expediente/gate";

import { audit } from "./index";

vi.mock("@/lib/env", () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: "sb_secret_abcdefghijklmnopqrstuvwxyz012345" } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/expediente/gate", () => ({ lerMetodoDaRequisicao: vi.fn() }));

const sessao = {
  userId: "11111111-1111-4111-8111-111111111111",
  papel: "admin" as string | null,
  settings: {} as Record<string, unknown>,
  rpcErro: null as string | null,
  support: null as { id: string; organization_id: string; access_mode: string; auth_session_id: string } | null,
  leituras: 0,
  rpcs: [] as string[],
};
const linhas: Array<Record<string, unknown>> = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: sessao.userId } } }) },
    rpc: async (nome: string) => {
      sessao.rpcs.push(nome);
      if (nome === "fn_user_role_in_org") {
        return sessao.rpcErro ? { data: null, error: { message: sessao.rpcErro } } : { data: sessao.papel, error: null };
      }
      return { data: null, error: null };
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            sessao.leituras += 1;
            return { data: { settings: sessao.settings }, error: null };
          },
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: async (linha: Record<string, unknown>) => {
        linhas.push(linha);
        return { error: null };
      },
    }),
  }),
}));
vi.mock("@/lib/impersonate/support", () => ({ readSupportContext: async () => sessao.support }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ATOR = sessao.userId;

/** Hoje (2026-11-23, segunda) fora e dentro de um expediente seg–sex 08:00–18:00 UTC. */
const comercial = { timezone: "Etc/UTC", windows: [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "08:00", end: "18:00" })) };
const FORA = new Date("2026-11-23T20:00:00Z");
const DENTRO = new Date("2026-11-23T10:00:00Z");

const base = { action: "conversation.transferred" as never, actorUserId: ATOR, organizationId: ORG };
const ultima = () => linhas[linhas.length - 1]!;
const meta = () => ultima().metadata as Record<string, unknown>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FORA);
  vi.clearAllMocks();
  linhas.length = 0;
  __limparCacheDoAuditParaTeste();
  sessao.userId = "11111111-1111-4111-8111-111111111111";
  sessao.papel = "admin";
  sessao.settings = { business_hours: comercial };
  sessao.rpcErro = null;
  sessao.support = null;
  sessao.leituras = 0;
  sessao.rpcs = [];
  vi.mocked(lerMetodoDaRequisicao).mockResolvedValue("POST");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("audit() — a marca `fora_do_expediente` (RF-10)", () => {
  it.each(["admin", "manager"])("`%s` fora do expediente: a linha SAI marcada", async (papel) => {
    sessao.papel = papel;
    await audit(base);
    expect(linhas).toHaveLength(1);
    expect(meta().fora_do_expediente).toBe(true);
  });

  it("DENTRO do expediente: a linha sai SEM o campo", async () => {
    vi.setSystemTime(DENTRO);
    await audit(base);
    expect("fora_do_expediente" in meta()).toBe(false);
  });

  it("`agent` fora do expediente (rota isenta que audita): SEM o campo", async () => {
    sessao.papel = "agent";
    await audit(base);
    expect("fora_do_expediente" in meta()).toBe(false);
  });

  it("não nasce linha nova: a marca vai na linha que já seria gravada", async () => {
    await audit(base);
    expect(linhas).toHaveLength(1);
    expect(ultima().action).toBe("conversation.transferred");
  });

  it("os metadados do chamador seguem na linha, junto com a marca", async () => {
    await audit({ ...base, metadata: { motivo: "manual" } });
    expect(meta()).toMatchObject({ motivo: "manual", fora_do_expediente: true });
  });

  it("a marca NÃO é forjável: `fora_do_expediente` mandado pelo chamador é descartado", async () => {
    vi.setSystemTime(DENTRO);
    await audit({ ...base, metadata: { fora_do_expediente: true } });
    expect("fora_do_expediente" in meta(), "dentro do expediente o chamador não pode marcar").toBe(false);
    vi.setSystemTime(FORA);
    await audit({ ...base, metadata: { fora_do_expediente: false } });
    expect(meta().fora_do_expediente, "fora do expediente o chamador não pode desmarcar").toBe(true);
  });
});

describe("audit() — quem NÃO marca", () => {
  it("método de leitura (GET): não marca", async () => {
    vi.mocked(lerMetodoDaRequisicao).mockResolvedValue("GET");
    await audit(base);
    expect("fora_do_expediente" in meta()).toBe(false);
  });

  it("método AUSENTE (worker, sem requisição): não marca, e a linha é gravada", async () => {
    vi.mocked(lerMetodoDaRequisicao).mockResolvedValue(null);
    await audit(base);
    expect(linhas).toHaveLength(1);
    expect("fora_do_expediente" in meta()).toBe(false);
  });

  it.each(["auth.logout", "auth.login_success", "authz.denied", "organization.switched", "profile.updated"])(
    "ação excluída por nome (`%s`): não marca",
    async (action) => {
      await audit({ ...base, action: action as never });
      expect("fora_do_expediente" in meta()).toBe(false);
    },
  );

  it("token Bearer / MCP (`actorApiTokenId`): não marca", async () => {
    await audit({ ...base, actorApiTokenId: "tok-1" });
    expect("fora_do_expediente" in meta()).toBe(false);
  });

  it("sem ator humano (worker, cron, IA): não marca", async () => {
    await audit({ ...base, actorUserId: null });
    expect("fora_do_expediente" in meta()).toBe(false);
  });

  it("GUARDA DE IDENTIDADE: a sessão é de OUTRA pessoa → não marca e a `rpc` de papel não é chamada", async () => {
    sessao.userId = "99999999-9999-4999-8999-999999999999";
    await audit(base);
    expect("fora_do_expediente" in meta()).toBe(false);
    expect(sessao.rpcs).not.toContain("fn_user_role_in_org");
  });

  it("sem expediente configurado (toda instalação que não o configurou): não marca e não paga a `rpc`", async () => {
    sessao.settings = {};
    await audit(base);
    expect("fora_do_expediente" in meta()).toBe(false);
    expect(sessao.rpcs).not.toContain("fn_user_role_in_org");
  });
});

describe("audit() — suporte e platform admin MARCAM, sem a `rpc` de papel", () => {
  it("sessão de suporte fora do expediente: marca", async () => {
    sessao.support = { id: "sup-1", organization_id: ORG, access_mode: "full", auth_session_id: "as-1" };
    sessao.papel = null; // a rpc devolve null sem vínculo: a marca não pode depender dela
    await audit(base);
    expect(meta()).toMatchObject({ support_session_id: "sup-1", fora_do_expediente: true });
    expect(sessao.rpcs).not.toContain("fn_user_role_in_org");
  });

  it("platform admin (`actingAsPlatformAdmin`) fora do expediente: marca", async () => {
    sessao.papel = null;
    await audit({ ...base, actingAsPlatformAdmin: true });
    expect(meta().fora_do_expediente).toBe(true);
  });

  it("suporte DENTRO do expediente: não marca", async () => {
    vi.setSystemTime(DENTRO);
    sessao.support = { id: "sup-1", organization_id: ORG, access_mode: "full", auth_session_id: "as-1" };
    await audit(base);
    expect("fora_do_expediente" in meta()).toBe(false);
  });
});

describe("audit() — falha só perde o campo (nunca bloqueia a mutação nem o audit)", () => {
  it("erro na `rpc` de papel: a linha é gravada SEM o campo e a falha é contada", async () => {
    sessao.rpcErro = "banco fora";
    await audit(base);
    expect(linhas).toHaveLength(1);
    expect("fora_do_expediente" in meta()).toBe(false);
    expect(falhasDaMarcaNoDia(ORG, new Date())).toBe(1);
  });

  it("a falha da marca não impede as marcas seguintes (a próxima mutação marca normalmente)", async () => {
    sessao.rpcErro = "banco fora";
    await audit(base);
    sessao.rpcErro = null;
    await audit(base);
    expect(linhas).toHaveLength(2);
    expect(meta().fora_do_expediente).toBe(true);
  });
});

describe("audit() — o método é lido na PRIMEIRA instrução (as 125 chamadas `void audit()`)", () => {
  it("`lerMetodoDaRequisicao` é chamado de forma SÍNCRONA, antes de qualquer `await`", async () => {
    const promessa = audit(base); // sem await: logo depois da chamada, o corpo síncrono já rodou
    expect(vi.mocked(lerMetodoDaRequisicao)).toHaveBeenCalledTimes(1);
    expect(linhas, "ainda nada foi gravado: estamos antes do primeiro await").toHaveLength(0);
    await promessa;
    expect(linhas).toHaveLength(1);
  });

  it("`void audit()`: o chamador não espera, e a marca sai mesmo assim", async () => {
    void audit(base);
    await vi.waitFor(() => expect(linhas).toHaveLength(1));
    expect(meta().fora_do_expediente).toBe(true);
  });
});

describe("audit() — o cache do expediente (30 s) não custa um SELECT por mutação", () => {
  it("duas mutações seguidas da mesma organização fazem UMA leitura do expediente", async () => {
    await audit(base);
    await audit(base);
    expect(sessao.leituras).toBe(1);
    expect(linhas).toHaveLength(2);
  });
});
