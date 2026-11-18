/**
 * Contador agregado de barrados (PRD-01 / #67, RNF-5 e N4): a rajada soma no contador, não em audit,
 * e Redis fora do ar nunca muda o que foi decidido.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const incr = vi.fn();
const expire = vi.fn();
const get = vi.fn();
vi.mock("@upstash/redis", () => ({
  Redis: class {
    incr = incr;
    expire = expire;
    get = get;
  },
}));

import {
  __reiniciarContadorParaTeste,
  chaveDoContador,
  contarBarrado,
  diaNoFuso,
  lerBarradosDoDia,
} from "./contador";

const ORG = "22222222-2222-4222-8222-222222222222";
/** 2026-07-14 01:30 UTC = 13/07 22:30 em São Paulo: o dia da organização ainda é 13. */
const AGORA = new Date("2026-07-14T01:30:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  __reiniciarContadorParaTeste();
  process.env.UPSTASH_REDIS_REST_URL = "http://redis.local:8079";
  process.env.UPSTASH_REDIS_REST_TOKEN = "token";
});

describe("chave do contador", () => {
  it("usa o dia NO FUSO da organização, não o dia UTC", () => {
    expect(diaNoFuso(AGORA, "America/Sao_Paulo")).toBe("2026-07-13");
    expect(diaNoFuso(AGORA, "UTC")).toBe("2026-07-14");
    expect(chaveDoContador(ORG, AGORA, "America/Sao_Paulo")).toBe(`expediente:barrados:${ORG}:2026-07-13`);
  });

  it("fuso que o Intl não conhece cai para UTC em vez de lançar", () => {
    expect(diaNoFuso(AGORA, "Marte/Olympus")).toBe("2026-07-14");
  });
});

describe("contarBarrado", () => {
  it("uma rajada de N tentativas incrementa N vezes e põe a validade de 48 h só na primeira", async () => {
    let n = 0;
    incr.mockImplementation(async () => ++n);
    for (let i = 0; i < 5; i++) expect(await contarBarrado(ORG, "America/Sao_Paulo", AGORA)).toBe(true);
    expect(incr).toHaveBeenCalledTimes(5);
    expect(incr).toHaveBeenCalledWith(`expediente:barrados:${ORG}:2026-07-13`);
    expect(expire).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenCalledWith(`expediente:barrados:${ORG}:2026-07-13`, 172800);
  });

  it("sem Redis configurado não conta e não lança", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    expect(await contarBarrado(ORG, "America/Sao_Paulo", AGORA)).toBe(false);
    expect(incr).not.toHaveBeenCalled();
  });

  it("Redis que lança não conta e não lança (a regra não depende do contador)", async () => {
    incr.mockRejectedValue(new Error("redis fora"));
    await expect(contarBarrado(ORG, "America/Sao_Paulo", AGORA)).resolves.toBe(false);
  });
});

describe("lerBarradosDoDia", () => {
  it("devolve o total do dia, 0 quando ninguém foi barrado e null quando o Redis não responde", async () => {
    get.mockResolvedValueOnce("7");
    expect(await lerBarradosDoDia(ORG, "America/Sao_Paulo", AGORA)).toBe(7);
    get.mockResolvedValueOnce(null);
    expect(await lerBarradosDoDia(ORG, "America/Sao_Paulo", AGORA)).toBe(0);
    get.mockRejectedValueOnce(new Error("redis fora"));
    expect(await lerBarradosDoDia(ORG, "America/Sao_Paulo", AGORA)).toBeNull();
  });
});
