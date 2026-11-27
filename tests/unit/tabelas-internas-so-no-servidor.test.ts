import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NENHUM CÓDIGO COM CLIENT DE SESSÃO TOCA UMA TABELA INTERNA.
 *
 * A 0241 (PRD-01 / #67, T3.0) tirou o acesso de `authenticated` a estas tabelas.
 * Quem a lê com a sessão do usuário passa a receber `permission denied` EM
 * PRODUÇÃO — e a tela quebra sem erro de compilação. Este teste pega o caso no
 * código, antes: um arquivo que cita a tabela fora de comentário e importa o
 * client de SESSÃO (`@/lib/supabase/server` ou `/browser`).
 *
 * Limite declarado: mede PRESENÇA do nome em arquivo com client de sessão. Um
 * helper que receba o nome por parâmetro, de outro arquivo, não é visto. Foi
 * exatamente esse ponto cego que quase fez a T3.0 revogar
 * `ai_router_decisions` e `lead_state_transitions` (a rota `ai/evolution` as lê
 * por um helper `ler(tabela, …)`), e é por isso que o grant é medido em banco em
 * `tests/invariants/tabelas-internas-sem-acesso-da-sessao.test.ts`.
 */
const INTERNAS = ["outbound_copies", "ai_invocations"] as const;
const RAIZES = ["app", "components", "hooks", "lib", "workers"];
const SESSAO = /from\s+["']@\/lib\/supabase\/(server|browser)["']/;

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) {
      if (nome === "node_modules" || nome === ".next") continue;
      arquivos(p, acc);
    } else if (/\.(ts|tsx)$/.test(nome) && !/\.(test|spec)\.|database\.types/.test(nome)) {
      acc.push(p);
    }
  }
  return acc;
}

function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("tabelas internas só no servidor", () => {
  const todos = RAIZES.flatMap((r) => {
    try {
      return arquivos(join(process.cwd(), r));
    } catch {
      return [];
    }
  });

  it("a varredura enxerga arquivos (controle positivo)", () => {
    expect(todos.length).toBeGreaterThan(200);
  });

  for (const tabela of INTERNAS) {
    it(`\`${tabela}\` não aparece em arquivo com client de sessão`, () => {
      // `\\b` e não `\b`: num template literal, `\b` é o caractere de RETROCESSO, e
      // a regex nunca casaria — o teste passaria sempre (achado na sabotagem).
      const re = new RegExp(`\\b${tabela}\\b`);
      const culpados = todos.filter((f) => {
        const src = readFileSync(f, "utf8");
        return SESSAO.test(src) && re.test(semComentarios(src));
      });
      expect(
        culpados,
        `${tabela} é interna (migration 0241): estes arquivos a citam com client de sessão e recebem permission denied`,
      ).toEqual([]);
    });
  }
});
