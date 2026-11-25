/**
 * O cache do expediente do `audit()` é UM por processo, mesmo quando o módulo é carregado mais de uma
 * vez (PRD-01 / #67, T2c).
 *
 * Por quê: no Next de produção, as rotas de API e as Server Actions ficam em grafos de módulos
 * DIFERENTES, e cada um carrega a sua própria cópia de `cache-do-audit.ts`. Com um `Map` no escopo do
 * módulo, o `PATCH /settings/expediente` descartava SÓ o cache da rota; a Server Action seguia com o
 * valor antigo pelo resto dos 30 s. Medido no e2e (2026-11-24): depois de a rota mudar o expediente para
 * "dentro", a linha `org.updated` da Server Action, 0,7 s depois, ainda saiu marcada como "fora".
 *
 * Este teste reproduz o defeito sem o Next: carrega o módulo DUAS vezes (`vi.resetModules`), como dois
 * grafos, e exige que descartar por um valha para o outro.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExpedienteConfig } from "@/lib/schemas/routing";

const ORG = "22222222-2222-4222-8222-222222222222";
const db = {} as never;
const config: ExpedienteConfig = { timezone: "Etc/UTC", windows: [{ dow: 1, start: "08:00", end: "18:00" }] };

const carregar = vi.fn();
vi.mock("./carregar", () => ({ carregarExpediente: (...a: unknown[]) => carregar(...a) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

type Modulo = typeof import("./cache-do-audit");

/** Uma "cópia" do módulo, como a que cada grafo do Next carrega. */
async function carregarCopia(): Promise<Modulo> {
  vi.resetModules();
  return (await import("./cache-do-audit")) as Modulo;
}

beforeEach(async () => {
  carregar.mockReset();
  carregar.mockResolvedValue(config);
  (await carregarCopia()).__limparCacheDoAuditParaTeste();
});

describe("duas cópias do módulo (rota e Server Action) compartilham o MESMO cache", () => {
  it("as cópias são de fato módulos diferentes (controle: o teste não está tautológico)", async () => {
    const rota = await carregarCopia();
    const acao = await carregarCopia();
    expect(rota).not.toBe(acao);
  });

  it("o PATCH (cópia da rota) descarta, e a Server Action (outra cópia) lê o valor NOVO", async () => {
    const rota = await carregarCopia();
    const acao = await carregarCopia();

    carregar.mockResolvedValueOnce(config); // a Server Action lê "fora" e guarda
    await acao.expedienteParaAudit(db, ORG, 1000);
    expect(carregar).toHaveBeenCalledTimes(1);

    rota.descartarExpedienteDoCache(ORG); // o PATCH da rota descarta

    const novo: ExpedienteConfig = { timezone: "Etc/UTC", windows: [{ dow: 2, start: "00:00", end: "23:59" }] };
    carregar.mockResolvedValueOnce(novo);
    expect(await acao.expedienteParaAudit(db, ORG, 2000)).toEqual(novo);
    expect(carregar, "a Server Action tem de ler de novo depois do descarte da rota").toHaveBeenCalledTimes(2);
  });

  it("o que uma cópia guarda, a outra aproveita (um SELECT por processo, não um por grafo)", async () => {
    const rota = await carregarCopia();
    const acao = await carregarCopia();
    await rota.expedienteParaAudit(db, ORG, 1000);
    await acao.expedienteParaAudit(db, ORG, 2000);
    expect(carregar).toHaveBeenCalledTimes(1);
  });

  it("o contador de falhas e o aviso agregado também são UM por processo", async () => {
    const rota = await carregarCopia();
    const acao = await carregarCopia();
    const dia = new Date("2026-11-24T12:00:00Z");
    expect(rota.registrarFalhaDaMarca(ORG, "x", dia)).toBe(true); // primeira do dia: emite
    expect(acao.registrarFalhaDaMarca(ORG, "y", dia), "a outra cópia NÃO repete o aviso do dia").toBe(false);
    expect(acao.falhasDaMarcaNoDia(ORG, dia)).toBe(2);
  });
});
