/**
 * A recuperação de senha gera o link no servidor e o entrega pelo Resend.
 *
 * O que se guarda aqui é o que um defeito silencioso quebraria sem nenhum erro:
 *  - o link é `token_hash` (abre em qualquer navegador), nunca `code` PKCE;
 *  - o domínio do link é o público, nunca o header Origin de quem fez o POST;
 *  - conta inexistente e conta existente respondem IGUAL (sem oráculo);
 *  - sem Resend a resposta é honesta e não depende do e-mail digitado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { headers } from "next/headers";

const generateLink = vi.fn();
const sendEmail = vi.fn();
const emailConfigurado = vi.fn();
const audit = vi.fn(async () => undefined);

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { generateLink } } }),
}));
vi.mock("@/lib/email/resend", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
  emailConfigurado: () => emailConfigurado(),
}));
vi.mock("@/lib/audit", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  audit: (...a: unknown[]) => audit(...a),
}));
vi.mock("@/lib/branding/saida", () => ({
  marcaDaSaida: async () => ({
    nome: "Cone Sul CRM",
    logoUrl: null,
    accent: "#506d48",
    accentFg: "#ffffff",
    origens: { nome: "padrao", cor: "padrao" },
  }),
  NEUTROS_DE_SAIDA: { texto: "#111", suave: "#666", fundo: "#fff", linha: "#ddd" },
}));

describe("requestPasswordReset", () => {
  beforeEach(() => {
    vi.resetModules();
    generateLink.mockReset();
    sendEmail.mockReset();
    audit.mockClear();
    emailConfigurado.mockReturnValue(true);
    sendEmail.mockResolvedValue({ ok: true, id: "e1" });
    vi.mocked(headers).mockResolvedValue({
      get: (k: string) =>
        ({ origin: "https://atacante.example", "x-forwarded-for": "198.51.100.7" })[k] ?? null,
    } as never);
  });

  it("envia pelo Resend um link token_hash no domínio público, não no Origin", async () => {
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: "hash+/=1" } },
      error: null,
    });
    const { requestPasswordReset } = await import("./requestPasswordReset");
    const res = await requestPasswordReset({ email: "ana@example.com" });

    expect(res).toEqual({ ok: true });
    expect(generateLink).toHaveBeenCalledWith({ type: "recovery", email: "ana@example.com" });
    const enviado = sendEmail.mock.calls[0]?.[0] as { to: string; html: string; text: string; fromName: string };
    expect(enviado.to).toBe("ana@example.com");
    expect(enviado.fromName).toBe("Cone Sul CRM");
    expect(enviado.text).toMatch(/\/auth\/confirm\?token_hash=hash%2B%2F%3D1&type=recovery/);
    expect(enviado.text).not.toContain("atacante.example");
    expect(enviado.text).not.toContain("code=");
  });

  it("conta inexistente responde igual ao sucesso e não envia nada", async () => {
    generateLink.mockResolvedValue({
      data: { properties: null },
      error: { status: 404, message: "User not found" },
    });
    const { requestPasswordReset } = await import("./requestPasswordReset");
    const res = await requestPasswordReset({ email: "ninguem@example.com" });

    expect(res).toEqual({ ok: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sem Resend configurado diz a verdade, antes de olhar a conta", async () => {
    emailConfigurado.mockReturnValue(false);
    const { requestPasswordReset } = await import("./requestPasswordReset");
    const res = await requestPasswordReset({ email: "ana@example.com" });

    expect(res).toEqual({ ok: false, error: "email_not_configured" });
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("falha do Resend vira request_failed e fica no audit sem o e-mail em claro", async () => {
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: "h1" } },
      error: null,
    });
    sendEmail.mockResolvedValue({ ok: false, error: "dominio_nao_verificado" });
    const { requestPasswordReset } = await import("./requestPasswordReset");
    const res = await requestPasswordReset({ email: "ana@example.com" });

    expect(res).toEqual({ ok: false, error: "request_failed" });
    const chamadas = JSON.stringify(audit.mock.calls);
    expect(chamadas).toContain("dominio_nao_verificado");
    expect(chamadas).not.toContain("ana@example.com");
  });
});
