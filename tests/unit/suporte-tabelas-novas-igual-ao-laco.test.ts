import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * AS POLICIES DE SUPORTE DAS TABELAS NOVAS SÃO CÓPIA FIEL DAS QUE O LAÇO DO BASELINE CRIA (PRD-01 / #67,
 * T4a, review do #131, achado 6).
 *
 * O baseline tem um laço (`do $f$ … for r in select … from pg_class …`) que cria as 3 policies
 * RESTRITIVAS `support_write_*` — o bloqueio de escrita da sessão de suporte somente-leitura — em toda
 * tabela com `organization_id` e RLS que o `authenticated` escreve. Esse laço só alcança tabela que JÁ
 * EXISTE quando ele roda, então numa instalação nova as tabelas criadas depois dele ficam sem o bloqueio.
 * A migration 0239 (`departments` e `department_members`) repete as 3 policies à mão, num bloco próprio.
 *
 * ## Por que o teste é ESTÁTICO, e não de banco
 *
 * O `test:db` mede o estado DEPOIS do `update` (o baseline é aplicado duas vezes). No `update` o laço
 * roda de novo e SOBRESCREVE as policies das tabelas novas com a definição dele — então, no banco, as
 * duas cópias são sempre iguais, mesmo que o texto tenha divergido. Um invariante de banco nunca veria a
 * deriva. A divergência é do TEXTO, e é o texto que se compara.
 *
 * ## O que prova, e o que não prova
 *
 * Prova: as 3 definições do bloco da 0239 (no baseline E na migration) são idênticas às do laço,
 * descontando o que o laço parametriza (o nome da tabela e o nome da coluna da organização). Reprova se
 * alguém mudar o laço sem mudar a cópia, ou o contrário, ou apagar uma das duas.
 * Não prova: o comportamento (isso é `tests/invariants/departamentos-estrutura.test.ts`) nem que uma
 * tabela FUTURA lembre de ter o bloco — esse é um defeito conhecido do próprio laço.
 */

const RAIZ = join(__dirname, "..", "..");
const BASELINE = readFileSync(join(RAIZ, "supabase", "baseline.sql"), "utf8");
const MIGRATION = readFileSync(
  join(RAIZ, "supabase", "migrations", "20261125120000_0239_departamentos_estrutura.sql"),
  "utf8",
);

/** `execute format('create policy support_write_<cmd> on public.%I …', <argumento>)` */
const FORMATO = /execute format\('(create policy (support_write_(?:insert|update|delete)) on public\.%I[^']*)',\s*([A-Za-z_.]+)/g;

/** Tira do texto o que o chamador parametriza: a coluna da organização (`%I` no laço, literal na cópia). */
function normalizar(sql: string): string {
  return sql.replace(/fn_support_write_allowed\((?:%I|organization_id)\)/g, "fn_support_write_allowed(COLUNA)").replace(/\s+/g, " ").trim();
}

function extrair(texto: string, argumento: string): Map<string, string> {
  const achadas = new Map<string, string>();
  for (const m of texto.matchAll(FORMATO)) {
    if (m[3] === argumento) achadas.set(m[2]!, normalizar(m[1]!));
  }
  return achadas;
}

describe("as policies de suporte das tabelas novas são cópia do laço do baseline", () => {
  const laco = extrair(BASELINE, "r.relname");
  const copiaNoBaseline = extrair(BASELINE, "t");
  const copiaNaMigration = extrair(MIGRATION, "t");

  it("o laço do baseline cria as 3 policies, e a cópia existe no baseline e na migration", () => {
    // Sem isto, trocar o formato do laço faria os `expect` abaixo compararem dois conjuntos vazios.
    expect([...laco.keys()].sort()).toEqual(["support_write_delete", "support_write_insert", "support_write_update"]);
    expect([...copiaNoBaseline.keys()].sort()).toEqual(["support_write_delete", "support_write_insert", "support_write_update"]);
    expect([...copiaNaMigration.keys()].sort()).toEqual(["support_write_delete", "support_write_insert", "support_write_update"]);
  });

  it.each(["support_write_insert", "support_write_update", "support_write_delete"])(
    "%s: a definição da cópia é idêntica à do laço",
    (nome) => {
      expect(copiaNoBaseline.get(nome), `baseline.sql: ${nome} divergiu do laço`).toBe(laco.get(nome));
      expect(copiaNaMigration.get(nome), `migration 0239: ${nome} divergiu do laço`).toBe(laco.get(nome));
    },
  );

  it("as duas tabelas novas são as que a cópia cobre, nos dois arquivos", () => {
    for (const [nome, texto] of [
      ["baseline.sql", BASELINE],
      ["migration 0239", MIGRATION],
    ] as const) {
      expect(texto, nome).toMatch(/foreach t in array array\['departments','department_members'\] loop/);
    }
  });
});
