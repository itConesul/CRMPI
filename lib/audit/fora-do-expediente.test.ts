/**
 * RF-10 (PRD-01 / #67, T2c): as regras de `deveMarcarForaDoExpediente`, uma por uma, na ordem em que a
 * spec as avalia (`02-design.md` §2.1). Cada regra barata encerra ANTES da cara: os espiões do cache do
 * expediente e da `rpc` de papel provam que não houve ida desnecessária ao banco.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { expedienteParaAudit } from "@/lib/expediente/cache-do-audit";
import type { ExpedienteConfig } from "@/lib/schemas/routing";

import { acaoNaoMarca, deveMarcarForaDoExpediente, type ContextoDaMarca, type EntradaDaMarca } from "./fora-do-expediente";

vi.mock("@/lib/expediente/cache-do-audit", () => ({ expedienteParaAudit: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";

/** Seg–sex, 08:00–18:00 em UTC. */
const comercial: ExpedienteConfig = {
  timezone: "Etc/UTC",
  windows: [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "08:00", end: "18:00" })),
};
const segundaDentro = new Date("2026-11-23T10:00:00Z"); // segunda 10:00 UTC
const segundaFora = new Date("2026-11-23T20:00:00Z"); // segunda 20:00 UTC
const sabado = new Date("2026-11-28T12:00:00Z");

const rpc = vi.fn();
const db = { rpc } as never;

const entrada = (e: Partial<EntradaDaMarca> = {}): EntradaDaMarca => ({
  action: "conversation.transferred",
  actorUserId: USER,
  organizationId: ORG,
  ...e,
});
const contexto = (c: Partial<ContextoDaMarca> = {}): ContextoDaMarca => ({
  metodo: Promise.resolve("POST"),
  sessaoEhOAtor: true,
  db,
  agora: segundaFora,
  ...c,
});
const papelDaRpc = (papel: string | null) => rpc.mockResolvedValue({ data: papel, error: null });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(expedienteParaAudit).mockResolvedValue(comercial);
  papelDaRpc("admin");
});

describe("regra 1 — ator humano de sessão numa organização", () => {
  it.each([
    ["token Bearer (`actorApiTokenId`)", { actorApiTokenId: "tok" }],
    ["sem ator (worker, cron, IA, ingestão)", { actorUserId: null }],
    ["sem organização", { organizationId: null }],
  ])("%s: não marca e NEM consulta o expediente", async (_r, e) => {
    expect(await deveMarcarForaDoExpediente(entrada(e), contexto())).toBe(false);
    expect(expedienteParaAudit).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("regra 2 — é uma mutação, e não uma ação de recusa ou de sessão", () => {
  it.each(["authz.denied", "auth.login_success", "auth.logout", "auth.mfa_success", "organization.switched", "profile.updated"])(
    "`%s` não marca, mesmo com `admin` fora do expediente (e não consulta nada)",
    async (action) => {
      expect(await deveMarcarForaDoExpediente(entrada({ action }), contexto())).toBe(false);
      expect(expedienteParaAudit).not.toHaveBeenCalled();
    },
  );

  it("`security.mfa_desativada` e `mfa.recovery_codes_regenerated` MARCAM: são o tipo de ação que a marca existe para destacar", async () => {
    for (const action of ["security.mfa_desativada", "mfa.recovery_codes_regenerated"]) {
      expect(await deveMarcarForaDoExpediente(entrada({ action }), contexto())).toBe(true);
    }
  });

  it.each(["POST", "PATCH", "PUT", "DELETE"])("método de escrita `%s` marca", async (metodo) => {
    expect(await deveMarcarForaDoExpediente(entrada(), contexto({ metodo: Promise.resolve(metodo) }))).toBe(true);
  });

  it.each(["GET", "HEAD", "OPTIONS"])("leitura `%s` não marca (rota GET que audita leitura)", async (metodo) => {
    expect(await deveMarcarForaDoExpediente(entrada(), contexto({ metodo: Promise.resolve(metodo) }))).toBe(false);
    expect(expedienteParaAudit).not.toHaveBeenCalled();
  });

  it("método AUSENTE não marca — o OPOSTO do gate (fail-closed para barrar, fail-open para marcar)", async () => {
    expect(await deveMarcarForaDoExpediente(entrada(), contexto({ metodo: Promise.resolve(null) }))).toBe(false);
    expect(expedienteParaAudit).not.toHaveBeenCalled();
  });
});

describe("regra 3 — o expediente da organização", () => {
  it("sem expediente configurado: não marca, e não pergunta o papel", async () => {
    vi.mocked(expedienteParaAudit).mockResolvedValue(null);
    expect(await deveMarcarForaDoExpediente(entrada(), contexto())).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("DENTRO do horário: não marca, e não paga a `rpc` de papel", async () => {
    expect(await deveMarcarForaDoExpediente(entrada(), contexto({ agora: segundaDentro }))).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sem sessão (`db` nulo): não marca e não consulta", async () => {
    expect(await deveMarcarForaDoExpediente(entrada(), contexto({ db: null }))).toBe(false);
    expect(expedienteParaAudit).not.toHaveBeenCalled();
  });

  it("sábado inteiro está fora; o relógio é o de `agora`", async () => {
    expect(await deveMarcarForaDoExpediente(entrada(), contexto({ agora: sabado }))).toBe(true);
  });

  it("janela que vira o dia (22:00–06:00): 23:00 está dentro e 12:00 está fora", async () => {
    vi.mocked(expedienteParaAudit).mockResolvedValue({
      timezone: "Etc/UTC",
      windows: [1, 2, 3, 4, 5, 6, 0].map((dow) => ({ dow, start: "22:00", end: "06:00" })),
    });
    expect(await deveMarcarForaDoExpediente(entrada(), contexto({ agora: new Date("2026-11-23T23:00:00Z") }))).toBe(false);
    expect(await deveMarcarForaDoExpediente(entrada(), contexto({ agora: new Date("2026-11-23T12:00:00Z") }))).toBe(true);
  });
});

describe("regra 4 — quem age (papel pela `rpc`, depois da guarda de identidade)", () => {
  it.each(["admin", "manager"])("`%s` fora do expediente MARCA", async (papel) => {
    papelDaRpc(papel);
    expect(await deveMarcarForaDoExpediente(entrada(), contexto())).toBe(true);
    expect(rpc).toHaveBeenCalledWith("fn_user_role_in_org", { p_org: ORG });
  });

  it.each(["agent", "viewer", "ai_operator", null])(
    "`%s` NÃO marca — `agent` nunca, nem em rota isenta (isenção é \"não é barrado ali\", não é bypass)",
    async (papel) => {
      papelDaRpc(papel);
      expect(await deveMarcarForaDoExpediente(entrada(), contexto())).toBe(false);
    },
  );

  it("GUARDA DE IDENTIDADE: se a sessão não é o ator, não marca e a `rpc` NÃO é chamada (leria o papel de outra pessoa)", async () => {
    expect(await deveMarcarForaDoExpediente(entrada(), contexto({ sessaoEhOAtor: false }))).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("erro na `rpc` de papel LANÇA (quem chama o captura, registra e grava a linha sem o campo)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(deveMarcarForaDoExpediente(entrada(), contexto())).rejects.toThrow(/fn_user_role_in_org: boom/);
  });

  it("sessão de SUPORTE marca, sem depender da `rpc` nem da guarda de identidade", async () => {
    expect(await deveMarcarForaDoExpediente(entrada(), contexto({ supportSessionId: "sup-1", sessaoEhOAtor: false }))).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("PLATFORM ADMIN (`actingAsPlatformAdmin`) marca, sem depender da `rpc` (ela devolve `null` sem vínculo)", async () => {
    papelDaRpc(null);
    expect(await deveMarcarForaDoExpediente(entrada({ actingAsPlatformAdmin: true }), contexto({ sessaoEhOAtor: false }))).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("suporte e platform admin DENTRO do horário não marcam: a marca é sobre o horário, não sobre o ator", async () => {
    expect(await deveMarcarForaDoExpediente(entrada(), contexto({ supportSessionId: "sup-1", agora: segundaDentro }))).toBe(false);
    expect(await deveMarcarForaDoExpediente(entrada({ actingAsPlatformAdmin: true }), contexto({ agora: segundaDentro }))).toBe(false);
  });

  it("suporte fora do horário mas numa ação excluída por nome (`auth.logout`): não marca", async () => {
    expect(await deveMarcarForaDoExpediente(entrada({ action: "auth.logout" }), contexto({ supportSessionId: "sup-1" }))).toBe(false);
  });
});

describe("`acaoNaoMarca` — a lista de exclusão por nome", () => {
  it("`authz.denied` e a família `auth.`", () => {
    expect(acaoNaoMarca("authz.denied")).toBe(true);
    expect(acaoNaoMarca("auth.anything_new")).toBe(true);
  });
  it("`authz.` NÃO é da família `auth.` (o prefixo é `auth.` com ponto): só `authz.denied` está na lista", () => {
    expect(acaoNaoMarca("authz.alguma_outra")).toBe(false);
  });
  it("ações de trabalho marcam", () => {
    for (const a of ["conversation.transferred", "expediente.config_changed", "lead.updated"]) expect(acaoNaoMarca(a)).toBe(false);
  });
});
