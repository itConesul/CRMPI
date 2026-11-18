/**
 * A espera pela próxima janela do TOTP não pode sair do orçamento de 30 s do teste.
 *
 * Origem: `moeda-da-organizacao.spec.ts:87` falhou nos PRs #82 e #84 e passou no
 * rerun. O trace mostrou 26,1 s de 30,9 s num único `waitForTimeout` — a espera
 * do login pela virada do código TOTP (replay protection), que vai de 0,3 s a
 * 30,3 s conforme a fase do relógio. O mesmo caso levou 6,5 / 18,4 / 29,0 / 31,2 s.
 *
 * Dois níveis, porque cada um sozinho deixa um buraco:
 *   - comportamento: a função estende o timeout pelo MESMO tempo que espera;
 *   - fiação: o helper de login usa a função, em vez de voltar ao `waitForTimeout`
 *     cru — que é como o defeito voltaria sem que o comportamento mudasse.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { esperarProximaJanelaTotp, FOLGA_DA_JANELA_MS } from "../e2e/utils/espera-totp";

/** Início de uma janela de 30 s, mais `faseMs` dentro dela. */
const naFase = (faseMs: number) => 1_700_000_010_000 - (1_700_000_010_000 % 30_000) + faseMs;

function dublês(timeout: number) {
  const chamadas = { esperou: [] as number[], trocou: [] as number[] };
  const page = {
    waitForTimeout: async (ms: number) => {
      chamadas.esperou.push(ms);
    },
  };
  const teste = {
    timeout,
    setTimeout(ms: number) {
      chamadas.trocou.push(ms);
      this.timeout = ms;
    },
  };
  return { page, teste, chamadas };
}

describe("esperarProximaJanelaTotp", () => {
  it("espera até a virada da janela + folga", async () => {
    const { page, chamadas } = dublês(30_000);
    const espera = await esperarProximaJanelaTotp(page, null, naFase(4_000));
    expect(espera).toBe(26_000 + FOLGA_DA_JANELA_MS);
    expect(chamadas.esperou).toEqual([26_000 + FOLGA_DA_JANELA_MS]);
  });

  it("estende o timeout do teste pelo MESMO tempo que esperou — o caso medido de 26 s", async () => {
    const { page, teste, chamadas } = dublês(30_000);
    const espera = await esperarProximaJanelaTotp(page, teste, naFase(4_000));
    expect(chamadas.trocou).toEqual([30_000 + espera]);
    // O teste ainda tem os 30 s dele para o trabalho, depois da espera.
    expect(teste.timeout - espera).toBe(30_000);
  });

  it.each([0, 1_000, 15_000, 29_999])("vale em qualquer fase do relógio (fase %i ms)", async (fase) => {
    const { page, teste, chamadas } = dublês(30_000);
    const espera = await esperarProximaJanelaTotp(page, teste, naFase(fase));
    expect(espera).toBe(30_000 - fase + FOLGA_DA_JANELA_MS);
    expect(chamadas.trocou).toEqual([30_000 + espera]);
    expect(chamadas.esperou).toEqual([espera]);
  });

  it("duas esperas no mesmo teste somam — a segunda parte do timeout já estendido", async () => {
    const { page, teste } = dublês(30_000);
    const a = await esperarProximaJanelaTotp(page, teste, naFase(10_000));
    const b = await esperarProximaJanelaTotp(page, teste, naFase(20_000));
    expect(teste.timeout).toBe(30_000 + a + b);
  });

  it("fora de um teste (script, seed) só espera, sem lançar", async () => {
    const { page, chamadas } = dublês(30_000);
    await expect(esperarProximaJanelaTotp(page, null, naFase(5_000))).resolves.toBeGreaterThan(0);
    expect(chamadas.esperou).toHaveLength(1);
    expect(chamadas.trocou).toEqual([]);
  });

  it("timeout 0 (sem limite) não vira um limite", async () => {
    const { page, teste, chamadas } = dublês(0);
    await esperarProximaJanelaTotp(page, teste, naFase(5_000));
    expect(chamadas.trocou).toEqual([]);
    expect(teste.timeout).toBe(0);
  });
});

describe("o helper de login usa a espera que estende o timeout", () => {
  const fonte = readFileSync(
    path.join(process.cwd(), "tests", "e2e", "helpers", "login-admin.ts"),
    "utf8",
  );

  it("nenhuma espera de janela volta a ser um waitForTimeout cru", () => {
    expect(fonte).not.toMatch(/waitForTimeout\(\s*msUntilNextTotpWindow/);
  });

  it("as duas esperas de janela passam por esperarProximaJanelaTotp", () => {
    expect(fonte.match(/esperarProximaJanelaTotp\(/g)).toHaveLength(2);
  });
});
