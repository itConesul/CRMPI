/**
 * Só `lib/audit/index.ts` escreve em `api_audit_log` (PRD-01 / #67, T2c, RF-10).
 *
 * A marca `fora_do_expediente` é decidida DENTRO do `audit()`. Um escritor que o contorne grava linhas
 * que nunca recebem a marca: um bypass sem rastro. Esta varredura impede que apareça um segundo
 * escritor sem que alguém o declare, com motivo, na lista abaixo.
 *
 * A regra é uma função pura exercitada também com fontes sintéticas: sem esse controle, "a varredura
 * não achou nada" não distinguiria um repositório certo de uma varredura cega.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const PASTAS = ["app", "lib", "workers", "hooks", "components"];
const IGNORA = new Set(["node_modules", ".next", ".git"]);

/** O ÚNICO escritor sem justificativa. */
const ESCRITOR_DO_AUDIT = "lib/audit/index.ts";

/**
 * Escritores permitidos, cada um com o MOTIVO. A lista só encolhe: acrescentar um exige justificar por
 * que a linha dele não precisa da marca do RF-10.
 */
export const ESCRITORES_PERMITIDOS: Record<string, string> = {
  "lib/ai/handoff/orchestrator.ts":
    "ação da IA (`ai.handoff_triggered`), sem ator humano de sessão: a regra 1 do RF-10 já a deixa de fora, " +
    "então a linha dele nunca receberia a marca",
};

/** Tira comentários, para que texto citando `api_audit_log` não conte como escritor. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Escreve em `api_audit_log`: `.from("api_audit_log")` seguido de insert/upsert/update/delete. */
const ESCREVE = /\.from\(\s*["'`]api_audit_log["'`]\s*\)\s*\.\s*(insert|upsert|update|delete)\b/;

export function escritoresDoAudit(fontes: Record<string, string>): string[] {
  return Object.entries(fontes)
    .filter(([, fonte]) => ESCREVE.test(semComentarios(fonte)))
    .map(([caminho]) => caminho)
    .sort();
}

/** `null` quando está certo; senão, a frase do defeito. */
export function escritoresNaoDeclarados(fontes: Record<string, string>): string | null {
  const intrusos = escritoresDoAudit(fontes).filter((c) => c !== ESCRITOR_DO_AUDIT && !(c in ESCRITORES_PERMITIDOS));
  return intrusos.length === 0 ? null : `escreve em api_audit_log sem passar pelo audit() e sem estar na lista: ${intrusos.join(", ")}`;
}

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (IGNORA.has(nome)) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, acc);
    else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.(ts|tsx)$/.test(nome)) acc.push(caminho);
  }
  return acc;
}

function fontesDoRepositorio(): Record<string, string> {
  const fontes: Record<string, string> = {};
  for (const pasta of PASTAS) {
    for (const f of arquivos(join(RAIZ, pasta))) fontes[relative(RAIZ, f).replace(/\\/g, "/")] = readFileSync(f, "utf8");
  }
  return fontes;
}

describe("só o audit() escreve em api_audit_log", () => {
  const fontes = fontesDoRepositorio();

  it("no repositório: nenhum escritor fora do audit() e da lista justificada", () => {
    expect(escritoresNaoDeclarados(fontes)).toBeNull();
  });

  it("controle positivo: a varredura enxerga o escritor real e o declarado (não é cega)", () => {
    const achados = escritoresDoAudit(fontes);
    expect(achados).toContain(ESCRITOR_DO_AUDIT);
    expect(achados).toContain("lib/ai/handoff/orchestrator.ts");
  });

  it("a lista de permitidos não guarda entrada morta: todo permitido ainda escreve de fato", () => {
    const achados = escritoresDoAudit(fontes);
    for (const permitido of Object.keys(ESCRITORES_PERMITIDOS)) {
      expect(achados, `${permitido} está na lista mas não escreve mais: remova-o`).toContain(permitido);
    }
  });

  it("todo permitido tem um motivo escrito", () => {
    for (const [arquivo, motivo] of Object.entries(ESCRITORES_PERMITIDOS)) {
      expect(motivo.trim().length, `${arquivo} sem motivo`).toBeGreaterThan(20);
    }
  });

  it("controle negativo: um segundo escritor sem declaração É reprovado", () => {
    const sintetico = {
      [ESCRITOR_DO_AUDIT]: 'client.from("api_audit_log").insert({})',
      "lib/x/escritor.ts": 'await admin\n  .from("api_audit_log")\n  .insert({ action: "x" })',
    };
    expect(escritoresNaoDeclarados(sintetico)).toMatch(/lib\/x\/escritor\.ts/);
  });

  it("controle negativo: update e delete também contam como escritor", () => {
    for (const verbo of ["update", "delete", "upsert"]) {
      const sintetico = { "lib/y.ts": `admin.from('api_audit_log').${verbo}({})` };
      expect(escritoresNaoDeclarados(sintetico), verbo).not.toBeNull();
    }
  });

  it("leitura (`select`) e menção em comentário NÃO são escritor", () => {
    const sintetico = {
      "lib/z.ts": 'admin.from("api_audit_log").select("id");\n// admin.from("api_audit_log").insert({})',
    };
    expect(escritoresNaoDeclarados(sintetico)).toBeNull();
  });
});
