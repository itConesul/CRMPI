/**
 * #99, T5 (RF-6, RF-7; CA-6 em unit, CA-7) — quem vê o botão "Excluir contato", e o que o diálogo diz.
 *
 * A REGRA mora no servidor (a rota exige `manager`, T4); o botão só a espelha. Para os dois não
 * divergirem de novo (risco da spec, §7), rota e tela leem o MESMO predicado em
 * `lib/contacts/pode-excluir-contato.ts`, e este teste prova que os dois o usam.
 *
 * ⚠️ O predicado é SÓ o papel efetivo da organização ativa. Não se soma `is_platform_admin ||`
 * (como em outros componentes): um platform admin SEM membership veria o botão e a rota o negaria
 * com 403 (spec `02-design.md` §1.3). A prova pela tela está em `tests/e2e/contato-excluir-so-manager.spec.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ROLE_RANK, type Role } from "@/lib/auth/types";
import {
  PAPEL_MINIMO_PARA_EXCLUIR_CONTATO,
  podeExcluirContato,
} from "@/lib/contacts/pode-excluir-contato";
import { DICIONARIO } from "@/lib/i18n/dicionario";

const RAIZ = join(__dirname, "..", "..");
const ler = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

describe("podeExcluirContato — o papel efetivo decide, igual à rota", () => {
  it.each<[Role, boolean]>([
    ["viewer", false],
    ["agent", false],
    ["ai_operator", false],
    ["manager", true],
    ["admin", true],
  ])("%s → %s", (papel, esperado) => {
    expect(podeExcluirContato(papel)).toBe(esperado);
  });

  it("sem organização ativa (papel ausente), não pode", () => {
    expect(podeExcluirContato(null)).toBe(false);
    expect(podeExcluirContato(undefined)).toBe(false);
  });

  it("o piso é manager — é o que a rota pede ao requireRole", () => {
    expect(PAPEL_MINIMO_PARA_EXCLUIR_CONTATO).toBe("manager");
    expect(ROLE_RANK[PAPEL_MINIMO_PARA_EXCLUIR_CONTATO]).toBe(ROLE_RANK.manager);
  });
});

describe("rota e tela usam o MESMO predicado (sem cópia que possa divergir)", () => {
  it("a rota DELETE pede o papel pela constante compartilhada", () => {
    const rota = ler("app/api/v1/contacts/[id]/route.ts");
    const delete_ = rota.slice(rota.indexOf("export async function DELETE"));
    expect(delete_).toContain("requireRole(PAPEL_MINIMO_PARA_EXCLUIR_CONTATO");
    expect(delete_).not.toContain('requireRole("agent"');
  });

  it("a tabela de contatos esconde o botão com podeExcluirContato e NÃO soma is_platform_admin", () => {
    const tabela = ler("components/contacts/ContactsTable.tsx");
    expect(tabela).toContain("podeExcluirContato(");
    expect(tabela).not.toContain("is_platform_admin");
  });
});

describe("CA-7 — o diálogo e o 409 não prometem apagar a conversa", () => {
  it("o texto 'conversa associada' saiu do componente e do dicionário", () => {
    expect(ler("components/contacts/ContactsTable.tsx")).not.toContain("conversa associada");
    expect(Object.keys(DICIONARIO).some((k) => k.includes("conversa associada"))).toBe(false);
  });

  it("o diálogo orienta a anonimizar, em pt-BR e es", () => {
    const chave = Object.keys(DICIONARIO).find((k) => k.startsWith("Contato com conversas ou compromissos"));
    expect(chave, "chave do diálogo no dicionário").toBeDefined();
    expect(chave).toContain("administrador");
    expect(DICIONARIO[chave as string]?.es).toContain("administrador");
    expect(ler("components/contacts/ContactsTable.tsx")).toContain(chave as string);
  });

  it("a mensagem do 409 existe em pt-BR e es (a chave que o handler usa)", () => {
    const chave = Object.keys(DICIONARIO).find((k) => k.startsWith("Este contato tem conversas ou compromissos vinculados"));
    expect(chave).toBeDefined();
    expect(DICIONARIO[chave as string]?.es).toMatch(/^Este contacto tiene conversaciones o citas vinculadas/);
  });
});
