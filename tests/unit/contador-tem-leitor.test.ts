/**
 * Nenhum contador é escrito sem leitor (PRD-01 / #67, RNF-5, `02-design.md` §2.1, T2d).
 *
 * O contador de tentativas barradas só serve se alguém o lê: escrito e nunca lido é "evento sem
 * consumer", o anti-pattern 3 do `CLAUDE.md`. Entre o gate (#88) e a T2d ele ficou escrito sem leitor, e
 * o mapa vivo o declarava ("ainda sem consumidor"). Esta varredura fecha a janela e impede a volta:
 * se `contarBarrado` tem chamador de produção, `lerBarradosDoDia` precisa ter ao menos um.
 *
 * A regra é uma função pura (`contadorSemLeitor`), exercitada também contra fontes sintéticas: sem esse
 * controle, "a varredura não achou problema" não distinguiria um repositório certo de uma varredura cega.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const PASTAS = ["app", "lib", "workers", "hooks", "components"];
const IGNORA = new Set(["node_modules", ".next", ".git"]);
const ARQUIVO_DO_CONTADOR = "lib/expediente/contador.ts";

/** Tira comentários, para que texto explicando o contador não conte como chamador. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Chamadores de produção de `nome`: arquivos que o usam, fora do próprio `contador.ts`. */
export function chamadoresDe(nome: string, fontes: Record<string, string>): string[] {
  const uso = new RegExp(`\\b${nome}\\s*\\(`);
  return Object.entries(fontes)
    .filter(([caminho]) => caminho !== ARQUIVO_DO_CONTADOR)
    .filter(([, fonte]) => uso.test(semComentarios(fonte)))
    .map(([caminho]) => caminho)
    .sort();
}

/** `null` quando está certo; senão, a frase do defeito. */
export function contadorSemLeitor(fontes: Record<string, string>): string | null {
  const escritores = chamadoresDe("contarBarrado", fontes);
  const leitores = chamadoresDe("lerBarradosDoDia", fontes);
  if (escritores.length > 0 && leitores.length === 0) {
    return `contarBarrado é chamado em ${escritores.join(", ")}, mas lerBarradosDoDia não tem nenhum chamador de produção`;
  }
  return null;
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
    for (const f of arquivos(join(RAIZ, pasta))) {
      fontes[relative(RAIZ, f).replace(/\\/g, "/")] = readFileSync(f, "utf8");
    }
  }
  return fontes;
}

describe("o contador de barrados tem leitor", () => {
  const fontes = fontesDoRepositorio();

  it("no repositório: se `contarBarrado` é chamado em produção, `lerBarradosDoDia` também", () => {
    expect(contadorSemLeitor(fontes)).toBeNull();
  });

  it("controle positivo: a varredura enxerga o escritor e o leitor reais (não é cega)", () => {
    expect(chamadoresDe("contarBarrado", fontes)).toContain("lib/auth/require-role.ts");
    expect(chamadoresDe("lerBarradosDoDia", fontes)).toContain("app/api/v1/settings/expediente/route.ts");
  });

  it("controle negativo: um contador escrito sem leitor É reprovado", () => {
    const sintetico = {
      [ARQUIVO_DO_CONTADOR]: "export async function contarBarrado() {}\nexport async function lerBarradosDoDia() {}",
      "lib/auth/require-role.ts": "void contarBarrado(org, tz);",
    };
    expect(contadorSemLeitor(sintetico)).toMatch(/lerBarradosDoDia não tem nenhum chamador/);
  });

  it("controle negativo: leitor só em comentário ou só em teste NÃO conta como leitor", () => {
    const sintetico = {
      "lib/auth/require-role.ts": "void contarBarrado(org, tz);",
      "app/api/x/route.ts": "// lerBarradosDoDia(org, tz) — a fazer\n/* lerBarradosDoDia(org) */",
    };
    expect(contadorSemLeitor(sintetico)).not.toBeNull();
  });

  it("sem escritor não há o que exigir (um repositório sem contador não é reprovado)", () => {
    expect(contadorSemLeitor({ "lib/x.ts": "export const a = 1;" })).toBeNull();
  });
});
