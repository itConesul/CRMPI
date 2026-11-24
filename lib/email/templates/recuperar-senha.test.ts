import { describe, expect, it } from "vitest";

import type { MarcaDeSaida } from "@/lib/branding/saida";

import { buildRecuperarSenhaEmail } from "./recuperar-senha";

const marca: MarcaDeSaida = {
  nome: "Cone Sul CRM",
  logoUrl: null,
  accent: "#506d48",
  accentFg: "#ffffff",
  origens: { nome: "padrao", cor: "padrao" },
};
const resetUrl = "https://crm.exemplo.com/auth/confirm?token_hash=abc123&type=recovery";

describe("buildRecuperarSenhaEmail", () => {
  it("leva a marca no assunto e o link no botão, no texto e no fallback", () => {
    const { subject, html, text } = buildRecuperarSenhaEmail({ resetUrl, marca });
    expect(subject).toBe("Redefinir sua senha no Cone Sul CRM");
    // O `&` do link vira `&amp;` dentro do HTML — é o atributo certo; no texto, cru.
    expect(html).toContain('href="https://crm.exemplo.com/auth/confirm?token_hash=abc123&amp;type=recovery"');
    expect(text).toContain(resetUrl);
  });

  it("usa a cor da marca no botão e fica no tema claro", () => {
    const { html } = buildRecuperarSenhaEmail({ resetUrl, marca });
    expect(html).toContain("background:#506d48");
    expect(html).toContain("color:#ffffff");
    expect(html).not.toMatch(/background:#0|prefers-color-scheme/i);
  });

  it("sem logo não desenha <img>; com logo desenha com dimensão no atributo", () => {
    expect(buildRecuperarSenhaEmail({ resetUrl, marca }).html).not.toContain("<img");
    const comLogo = buildRecuperarSenhaEmail({
      resetUrl,
      marca: { ...marca, logoUrl: "https://crm.exemplo.com/logo.png" },
    }).html;
    expect(comLogo).toContain('<img src="https://crm.exemplo.com/logo.png"');
    expect(comLogo).toContain('height="40"');
  });

  it("escapa nome de marca e logo vindos de campo livre", () => {
    const { html, subject } = buildRecuperarSenhaEmail({
      resetUrl,
      marca: { ...marca, nome: 'A"<script>x</script>', logoUrl: 'x" onerror="y' },
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('onerror="y');
    expect(subject).toContain("Redefinir sua senha");
  });

  it("não diz se a conta existe", () => {
    const { html, text } = buildRecuperarSenhaEmail({ resetUrl, marca });
    expect(html + text).not.toMatch(/conta (n[ãa]o|inexistente)|cadastr/i);
  });
});
