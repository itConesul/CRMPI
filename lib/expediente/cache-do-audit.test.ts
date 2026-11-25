/**
 * O cache do expediente DO `audit()` (T2c, RF-10, `02-design.md` §2.1 regra 3): TTL de 30 s, descarte
 * pelo `PATCH`, `null` cacheado, e o sinal agregado da falha da marca (um aviso por organização, por
 * dia, por processo). E, o ponto da #110: o carregador compartilhado com o gate NÃO cacheia.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/lib/logger";
import type { ExpedienteConfig } from "@/lib/schemas/routing";

import { carregarExpediente } from "./carregar";
import {
  __limparCacheDoAuditParaTeste,
  descartarExpedienteDoCache,
  expedienteParaAudit,
  falhasDaMarcaNoDia,
  registrarFalhaDaMarca,
  TTL_DO_CACHE_DO_AUDIT_MS,
} from "./cache-do-audit";

vi.mock("./carregar", () => ({ carregarExpediente: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const ORG = "22222222-2222-4222-8222-222222222222";
const OUTRA = "33333333-3333-4333-8333-333333333333";
const db = {} as never;
const config: ExpedienteConfig = { timezone: "Etc/UTC", windows: [{ dow: 1, start: "08:00", end: "18:00" }] };
const T0 = 1_000_000;

beforeEach(() => {
  vi.clearAllMocks();
  __limparCacheDoAuditParaTeste();
  vi.mocked(carregarExpediente).mockResolvedValue(config);
});

describe("cache do expediente do audit() — TTL de 30 s", () => {
  it("o TTL é de 30 s (a decisão do dono vale só para a marca do audit())", () => {
    expect(TTL_DO_CACHE_DO_AUDIT_MS).toBe(30_000);
  });

  it("duas mutações da mesma organização dentro do TTL fazem UMA leitura", async () => {
    await expedienteParaAudit(db, ORG, T0);
    await expedienteParaAudit(db, ORG, T0 + TTL_DO_CACHE_DO_AUDIT_MS - 1);
    expect(carregarExpediente).toHaveBeenCalledTimes(1);
  });

  it("passado o TTL, lê de novo", async () => {
    await expedienteParaAudit(db, ORG, T0);
    await expedienteParaAudit(db, ORG, T0 + TTL_DO_CACHE_DO_AUDIT_MS + 1);
    expect(carregarExpediente).toHaveBeenCalledTimes(2);
  });

  it("organizações diferentes não compartilham a entrada", async () => {
    await expedienteParaAudit(db, ORG, T0);
    await expedienteParaAudit(db, OUTRA, T0);
    expect(carregarExpediente).toHaveBeenCalledTimes(2);
  });

  it("`PATCH /settings/expediente` descarta a entrada da organização (e só dela)", async () => {
    await expedienteParaAudit(db, ORG, T0);
    await expedienteParaAudit(db, OUTRA, T0);
    descartarExpedienteDoCache(ORG);
    await expedienteParaAudit(db, ORG, T0 + 1);
    await expedienteParaAudit(db, OUTRA, T0 + 1);
    expect(carregarExpediente).toHaveBeenCalledTimes(3); // ORG leu de novo; OUTRA continuou no cache
  });

  it("`null` (sem expediente, o estado de toda instalação que não o configurou) TAMBÉM é cacheado", async () => {
    vi.mocked(carregarExpediente).mockResolvedValue(null);
    expect(await expedienteParaAudit(db, ORG, T0)).toBeNull();
    expect(await expedienteParaAudit(db, ORG, T0 + 1000)).toBeNull();
    expect(carregarExpediente).toHaveBeenCalledTimes(1);
  });

  it("devolve a configuração lida", async () => {
    expect(await expedienteParaAudit(db, ORG, T0)).toEqual(config);
  });
});

describe("o carregador compartilhado com o gate NÃO cacheia (#110)", () => {
  it("`carregar.ts` não tem cache: o cache é só do audit() e envolve o carregador", async () => {
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync("lib/expediente/carregar.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(fonte).not.toMatch(/\bnew Map\b|\bcache\b|venceEm|TTL|setTimeout/i);
  });
});

describe("sinal agregado da falha da marca — um aviso por organização, por dia, por processo", () => {
  const dia1 = new Date("2026-11-24T12:00:00Z");
  const dia2 = new Date("2026-11-25T12:00:00Z");
  const avisosAgregados = () =>
    vi.mocked(logger.warn).mock.calls.filter(([msg]) => String(msg).includes("está falhando nesta organização")).length;

  it("a PRIMEIRA falha do dia emite o aviso agregado; as seguintes só somam", () => {
    expect(registrarFalhaDaMarca(ORG, new Error("a"), dia1)).toBe(true);
    expect(registrarFalhaDaMarca(ORG, new Error("b"), dia1)).toBe(false);
    expect(registrarFalhaDaMarca(ORG, new Error("c"), dia1)).toBe(false);
    expect(avisosAgregados()).toBe(1);
    expect(falhasDaMarcaNoDia(ORG, dia1)).toBe(3);
  });

  it("cada falha ainda registra o `warn` por falha (o agregado não substitui)", () => {
    registrarFalhaDaMarca(ORG, new Error("a"), dia1);
    registrarFalhaDaMarca(ORG, new Error("b"), dia1);
    const porFalha = vi.mocked(logger.warn).mock.calls.filter(([m]) => String(m).includes("a marca fora_do_expediente falhou")).length;
    expect(porFalha).toBe(2);
  });

  it("outra organização e outro dia têm o próprio aviso", () => {
    expect(registrarFalhaDaMarca(ORG, "x", dia1)).toBe(true);
    expect(registrarFalhaDaMarca(OUTRA, "x", dia1)).toBe(true);
    expect(registrarFalhaDaMarca(ORG, "x", dia2)).toBe(true);
    expect(avisosAgregados()).toBe(3);
  });

  it("aceita erro que não é `Error` e nunca lança", () => {
    expect(() => registrarFalhaDaMarca(ORG, { estranho: true }, dia1)).not.toThrow();
  });
});
