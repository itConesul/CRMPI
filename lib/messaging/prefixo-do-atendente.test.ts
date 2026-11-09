import { describe, expect, it } from "vitest";

import { corpoComNomeDoAtendente, nomeParaPrefixo } from "@/lib/messaging/prefixo-do-atendente";

describe("corpoComNomeDoAtendente", () => {
  it("nome em negrito, dois-pontos, texto na linha de baixo", () => {
    expect(corpoComNomeDoAtendente("Maria", "Bom dia, tudo bem?")).toBe("*Maria:*\nBom dia, tudo bem?");
  });

  it("preserva as quebras de linha do texto do atendente", () => {
    expect(corpoComNomeDoAtendente("João", "linha 1\nlinha 2")).toBe("*João:*\nlinha 1\nlinha 2");
  });

  it("sem nome utilizável o texto sai intacto — não inventa 'Atendente'", () => {
    for (const nome of [null, undefined, "", "   ", "***", "_~`"]) {
      expect(corpoComNomeDoAtendente(nome, "oi")).toBe("oi");
    }
  });

  it("corpo vazio não ganha prefixo (não há o que identificar)", () => {
    expect(corpoComNomeDoAtendente("Maria", "")).toBe("");
  });

  it("marcação do WhatsApp no nome é removida, para não quebrar o negrito nem formatar o resto", () => {
    expect(nomeParaPrefixo("Ma*ri_a ~Silva~")).toBe("Maria Silva");
    expect(corpoComNomeDoAtendente("*Admin*", "oi")).toBe("*Admin:*\noi");
  });

  it("quebra de linha e espaços repetidos no nome viram um espaço", () => {
    expect(nomeParaPrefixo("  Maria \n  Silva ")).toBe("Maria Silva");
  });

  it("nome gigante é cortado", () => {
    expect(nomeParaPrefixo("A".repeat(200))?.length).toBe(60);
  });
});
