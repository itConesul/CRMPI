import { describe, expect, it } from "vitest";

import { buildSenhaTrocadaEmail } from "./senha-trocada";

const marca = {
  nome: "Cone Sul CRM",
  logoUrl: null,
  accent: "#506d48",
  accentFg: "#ffffff",
  origens: { nome: "padrao", cor: "padrao" },
} as never;

describe("buildSenhaTrocadaEmail", () => {
  it("nomeia a marca e leva o caminho de quem NÃO fez a troca", () => {
    const m = buildSenhaTrocadaEmail({ marca, recuperarUrl: "https://crm.example/login/forgot" });

    expect(m.subject).toBe("Sua senha no Cone Sul CRM foi alterada");
    expect(m.html).toContain("https://crm.example/login/forgot");
    expect(m.text).toContain("https://crm.example/login/forgot");
    expect(m.text).toMatch(/Não foi você/);
  });

  it("não carrega nenhuma senha, só o aviso", () => {
    const m = buildSenhaTrocadaEmail({ marca, recuperarUrl: "https://crm.example/login/forgot" });

    expect(m.html + m.text).not.toMatch(/senha-de-hoje|password=/i);
  });

  it("escapa a marca e a URL no HTML", () => {
    const m = buildSenhaTrocadaEmail({
      marca: { ...(marca as object), nome: 'A<b>"x"' } as never,
      recuperarUrl: "https://crm.example/?a=1&b=2",
    });

    expect(m.html).toContain("A&lt;b&gt;&quot;x&quot;");
    expect(m.html).toContain("a=1&amp;b=2");
    expect(m.html).not.toContain("<b>");
  });
});
