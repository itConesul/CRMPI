/**
 * O vocabulário das ações que NÃO recebem a marca `fora_do_expediente` (PRD-01 / #67, T2c, RF-10).
 *
 * A lista de exclusão por nome mora numa constante compartilhada (`lib/audit/fora-do-expediente.ts`).
 * Constante sem prova envelhece: um código novo na família de sessão, ou um nome renomeado, mudaria o
 * que marca sem ninguém ver. Este teste amarra a lista ao vocabulário real (`AUDIT_ACTIONS`) e às
 * Server Actions de sessão que emitem ações.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import {
  ACOES_EXATAS_QUE_NAO_MARCAM,
  PREFIXO_DE_SESSAO_QUE_NAO_MARCA,
  acaoNaoMarca,
} from "@/lib/audit/fora-do-expediente";

const vocabulario: readonly string[] = AUDIT_ACTIONS;

/**
 * Ações emitidas por Server Actions de SESSÃO que, de propósito, MARCAM (não estão na lista de
 * exclusão). Cada uma com o motivo: são decisões de segurança de um humano, o tipo de coisa que a marca
 * existe para destacar fora do horário.
 */
const SESSAO_QUE_MARCA: Record<string, string> = {
  "security.mfa_desativada": "desativar a verificação em duas etapas fora do horário é o que a marca existe para destacar",
};

describe("a lista de exclusão por nome acompanha o vocabulário real", () => {
  it("a família `auth.` tem 19 códigos hoje e TODOS ficam de fora (sem exceção por esquecimento)", () => {
    const auth = vocabulario.filter((a) => a.startsWith(PREFIXO_DE_SESSAO_QUE_NAO_MARCA));
    expect(auth.length, "o `CLAUDE.md`/spec cita 19; se mudou, a lista continua cobrindo por prefixo").toBeGreaterThanOrEqual(19);
    for (const a of auth) expect(acaoNaoMarca(a), a).toBe(true);
  });

  it("`authz.denied` existe no vocabulário e fica de fora", () => {
    expect(vocabulario).toContain("authz.denied");
    expect(acaoNaoMarca("authz.denied")).toBe(true);
  });

  it("toda ação exata da lista EXISTE no vocabulário (nada renomeado ou digitado errado)", () => {
    for (const a of ACOES_EXATAS_QUE_NAO_MARCAM) expect(vocabulario, `${a} não existe em AUDIT_ACTIONS`).toContain(a);
  });

  it("nenhuma ação de TRABALHO está excluída por engano: o que sai da marca é só sessão, perfil e recusa", () => {
    const excluidas = vocabulario.filter(acaoNaoMarca);
    const intrusas = excluidas.filter(
      (a) => !a.startsWith(PREFIXO_DE_SESSAO_QUE_NAO_MARCA) && !ACOES_EXATAS_QUE_NAO_MARCAM.includes(a),
    );
    expect(intrusas).toEqual([]);
  });

  it("as ações de segurança de MFA de um humano MARCAM (não estão na lista)", () => {
    for (const a of ["security.mfa_desativada", "mfa.recovery_codes_regenerated"]) {
      expect(vocabulario, a).toContain(a);
      expect(acaoNaoMarca(a), a).toBe(false);
    }
  });
});

describe("Server Actions de sessão: toda ação que emitem está classificada", () => {
  const dir = join(process.cwd(), "app/actions/auth");
  const emitidas = new Set<string>();
  for (const nome of readdirSync(dir)) {
    if (!/\.ts$/.test(nome) || /\.test\.ts$/.test(nome)) continue;
    for (const m of readFileSync(join(dir, nome), "utf8").matchAll(/action:\s*["']([a-z_.]+)["']/g)) emitidas.add(m[1]!);
  }

  it("a varredura achou as ações (controle positivo: não é cega)", () => {
    expect(emitidas.size).toBeGreaterThan(10);
    expect(emitidas.has("auth.logout")).toBe(true);
  });

  it("cada ação de `app/actions/auth` está na lista de exclusão OU em `SESSAO_QUE_MARCA`, com motivo", () => {
    const sem = [...emitidas].filter((a) => !acaoNaoMarca(a) && !(a in SESSAO_QUE_MARCA));
    expect(
      sem,
      `ação nova de sessão sem decisão: ${sem.join(", ")}. Ela marcaria como "fora do expediente" sem ninguém ter decidido`,
    ).toEqual([]);
  });

  it("`SESSAO_QUE_MARCA` não guarda entrada morta", () => {
    for (const a of Object.keys(SESSAO_QUE_MARCA)) expect(emitidas.has(a), `${a} não é mais emitida em app/actions/auth`).toBe(true);
  });
});
