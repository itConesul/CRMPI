/**
 * AS TABELAS INTERNAS NÃO SÃO SERVIDAS PELO POSTGREST — E ISSO SE MEDE, NÃO SE DECLARA.
 *
 * PRD-01 / #67, T3.0. O dono decidiu em 2026-11-27 que tabela "interna" (nenhuma
 * tela a lê com a sessão do usuário) perde o acesso de `authenticated`.
 *
 * ## Por que mede PRIVILÉGIO e não só linhas
 *
 * Com RLS ligada e uma policy por organização, um `viewer` da organização A lê
 * as linhas da A — e um teste que contasse linhas cross-org passaria mesmo SEM o
 * revoke. O que distingue "a policy barrou" de "o privilégio não existe" é o
 * `permission denied`. É ele que se prova aqui.
 *
 * ## O controle positivo
 *
 * `service_role` CONTINUA com privilégio. Sem o caso, uma sonda com nome de
 * tabela errado devolveria NENHUM para todo mundo e os outros passariam por
 * acidente — e o servidor (`pg` e client admin) é quem usa estas tabelas.
 *
 * ## O que NÃO entra, de propósito
 *
 * `ai_router_decisions` e `lead_state_transitions` ficam de fora: a tela Evolução
 * as lê por sessão. Elas saem na T3.1, com a troca da rota. Se alguém as
 * acrescentar aqui antes, a tela quebra — o e2e a pega, e este comentário diz por quê.
 */
import { describe, expect, it } from "vitest";

import { motivoDoErro, sql } from "./psql-transporte";

const TABELAS = ["outbound_copies", "ai_invocations"] as const;

function erroSob(papel: string, comando: string): string | null {
  try {
    sql(`set role ${papel};\n${comando};\nreset role;`);
    return null;
  } catch (err) {
    return motivoDoErro(err);
  }
}

function privilegiosDe(tabela: string, papel: string): string {
  return sql(`
    select coalesce(string_agg(distinct privilege_type, ',' order by privilege_type), 'NENHUM')
      from information_schema.role_table_grants
     where table_schema = 'public' and table_name = '${tabela}' and grantee = '${papel}';
  `).trim();
}

describe.each(TABELAS)("`%s` é só do servidor", (tabela) => {
  it("`anon` e `authenticated` não têm privilégio NENHUM", () => {
    expect(privilegiosDe(tabela, "anon")).toBe("NENHUM");
    expect(privilegiosDe(tabela, "authenticated")).toBe("NENHUM");
  });

  it("`service_role` CONTINUA com privilégio — controle positivo da sonda", () => {
    const p = privilegiosDe(tabela, "service_role");
    expect(p).toContain("SELECT");
    expect(p).toContain("INSERT");
  });

  it("`authenticated` é BARRADO ao ler, escrever e apagar — permission denied, não zero linhas", () => {
    for (const comando of [
      `select 1 from public.${tabela} limit 1`,
      `delete from public.${tabela}`,
      `update public.${tabela} set organization_id = organization_id`,
    ]) {
      const erro = erroSob("authenticated", comando);
      expect(erro, `\`authenticated\` executou "${comando}" SEM erro — a tabela está exposta`).not.toBeNull();
      expect(erro).toContain("permission denied");
    }
  });

  it("a RLS continua LIGADA — o segundo degrau, para o dia em que o grant voltar", () => {
    const ligada = sql(`select relrowsecurity from pg_class where oid = 'public.${tabela}'::regclass;`).trim();
    expect(ligada, "RLS desligada: o revoke vira a única defesa").toBe("t");
  });
});
