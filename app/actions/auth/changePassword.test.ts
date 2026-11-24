/**
 * Trocar a própria senha (issue #106).
 *
 * O que se guarda aqui é o que um defeito silencioso quebraria sem nenhum erro:
 *  - a senha ATUAL é conferida num client SEM cookie — no client de sessão ela
 *    trocaria a sessão `aal2` por uma `aal1` e a conta com MFA seria recusada
 *    na troca seguinte;
 *  - com MFA cadastrado e sessão `aal1`, NADA é tocado: nem a senha atual é
 *    perguntada (senão o formulário viraria oráculo de senha sem o fator);
 *  - o e-mail é cortesia: sem Resend, ou com ele falhando, a troca vale;
 *  - nenhuma senha, atual ou nova, chega ao audit.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { headers } from "next/headers";

const getUser = vi.fn();
const getAal = vi.fn();
const updateUser = vi.fn();
const signOut = vi.fn();
const sessaoSignIn = vi.fn();
const avulsoSignIn = vi.fn();
const avulsoSignOut = vi.fn();
const sendEmail = vi.fn();
const emailConfigurado = vi.fn();
const rateLimited = vi.fn();
const audit = vi.fn(async (_evento?: unknown) => undefined);

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser,
      updateUser,
      signOut,
      signInWithPassword: sessaoSignIn,
      mfa: { getAuthenticatorAssuranceLevel: getAal },
    },
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signInWithPassword: avulsoSignIn, signOut: avulsoSignOut } }),
}));
vi.mock("@/lib/email/resend", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
  emailConfigurado: () => emailConfigurado(),
}));
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  authRateLimited: (...a: unknown[]) => rateLimited(...a),
}));
vi.mock("@/lib/audit", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  audit: (evento: unknown) => audit(evento),
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

const ATUAL = "senha-de-hoje-1";
const NOVA = "senha-nova-forte-2";
const entrada = { current_password: ATUAL, password: NOVA, password_confirm: NOVA };

async function chamar(input: unknown = entrada) {
  const { changePassword } = await import("./changePassword");
  return changePassword(input as never);
}

function eventos() {
  return audit.mock.calls.map(
    (c) => c[0] as { action: string; metadata?: Record<string, unknown> },
  );
}

function primeiro() {
  const e = eventos()[0];
  if (!e) throw new Error("nenhum evento de audit foi emitido");
  return e;
}

describe("changePassword", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const m of [
      getUser,
      getAal,
      updateUser,
      signOut,
      sessaoSignIn,
      avulsoSignIn,
      avulsoSignOut,
      sendEmail,
      rateLimited,
    ]) {
      m.mockReset();
    }
    audit.mockClear();
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "ana@example.com" } } });
    getAal.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal1" } });
    rateLimited.mockResolvedValue(false);
    avulsoSignIn.mockResolvedValue({ data: { session: { access_token: "x" } }, error: null });
    avulsoSignOut.mockResolvedValue({ error: null });
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    emailConfigurado.mockReturnValue(true);
    sendEmail.mockResolvedValue({ ok: true, id: "e1" });
    vi.mocked(headers).mockResolvedValue({
      get: (k: string) => ({ "x-forwarded-for": "198.51.100.7" })[k] ?? null,
    } as never);
  });

  it("troca a senha, derruba as outras sessões e audita", async () => {
    const r = await chamar();

    expect(r).toEqual({ ok: true });
    expect(updateUser).toHaveBeenCalledWith({ password: NOVA });
    expect(signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(eventos().map((e) => e.action)).toEqual(["auth.password_changed"]);
    expect(primeiro().metadata).toMatchObject({
      other_sessions_revoked: true,
      email_dispatched: true,
    });
  });

  it("confere a senha atual FORA da sessão e encerra a sessão avulsa", async () => {
    await chamar();

    expect(avulsoSignIn).toHaveBeenCalledWith({ email: "ana@example.com", password: ATUAL });
    expect(avulsoSignOut).toHaveBeenCalledTimes(1);
    // O client de sessão jamais pergunta a senha: faria a sessão virar aal1.
    expect(sessaoSignIn).not.toHaveBeenCalled();
  });

  it("usa o e-mail da SESSÃO, nunca um que venha do corpo", async () => {
    await chamar({ ...entrada, email: "outra@example.com" });

    expect(avulsoSignIn).toHaveBeenCalledWith(
      expect.objectContaining({ email: "ana@example.com" }),
    );
  });

  it("senha atual errada: recusa, não troca nada e audita sem vazar senha", async () => {
    avulsoSignIn.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid login credentials" },
    });

    const r = await chamar();

    expect(r).toEqual({ ok: false, error: "wrong_current_password" });
    expect(updateUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(primeiro()).toMatchObject({
      action: "auth.password_change_failed",
      metadata: { reason: "wrong_current_password" },
    });
    const tudo = JSON.stringify(audit.mock.calls);
    expect(tudo).not.toContain(ATUAL);
    expect(tudo).not.toContain(NOVA);
  });

  it("conta com MFA e sessão aal1: barra ANTES de perguntar a senha atual", async () => {
    getAal.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal2" } });

    const r = await chamar();

    expect(r).toEqual({ ok: false, error: "mfa_required" });
    expect(avulsoSignIn).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
    expect(primeiro()).toMatchObject({ metadata: { reason: "mfa_required" } });
  });

  it("conta com MFA e sessão aal2: troca normalmente", async () => {
    getAal.mockResolvedValue({ data: { currentLevel: "aal2", nextLevel: "aal2" } });

    expect(await chamar()).toEqual({ ok: true });
    expect(updateUser).toHaveBeenCalled();
  });

  it("teto de tentativas por conta: recusa sem tocar na senha", async () => {
    rateLimited.mockResolvedValue(true);

    const r = await chamar();

    expect(r).toEqual({ ok: false, error: "rate_limited" });
    expect(rateLimited).toHaveBeenCalledWith("troca_de_senha", "u1", expect.anything());
    expect(avulsoSignIn).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("sem sessão: session_expired, sem tocar em nada", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    expect(await chamar()).toEqual({ ok: false, error: "session_expired" });
    expect(avulsoSignIn).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("nova igual à atual: recusa sem gastar tentativa de senha", async () => {
    const r = await chamar({ current_password: ATUAL, password: ATUAL, password_confirm: ATUAL });

    expect(r).toEqual({ ok: false, error: "same_password" });
    expect(avulsoSignIn).not.toHaveBeenCalled();
  });

  it("confirmação diferente ou senha curta: validation_error", async () => {
    expect(await chamar({ ...entrada, password_confirm: "outra" })).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(
      await chamar({ ...entrada, password: "curta", password_confirm: "curta" }),
    ).toMatchObject({ ok: false, error: "validation_error" });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("sem Resend: a troca vale e nenhum e-mail é tentado", async () => {
    emailConfigurado.mockReturnValue(false);

    expect(await chamar()).toEqual({ ok: true });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(primeiro().metadata).toMatchObject({ email_dispatched: false });
  });

  it("Resend falhando (resposta ou exceção): a troca vale do mesmo jeito", async () => {
    sendEmail.mockResolvedValueOnce({ ok: false, error: "domain_not_verified" });
    expect(await chamar()).toEqual({ ok: true });

    sendEmail.mockRejectedValueOnce(new Error("rede caiu"));
    expect(await chamar()).toEqual({ ok: true });
  });

  it("derrubar as outras sessões falhando não desfaz a troca, e fica no audit", async () => {
    signOut.mockResolvedValue({ error: { message: "boom" } });

    expect(await chamar()).toEqual({ ok: true });
    expect(primeiro().metadata).toMatchObject({ other_sessions_revoked: false });
  });

  it("o GoTrue recusando por senha igual à antiga vira same_password", async () => {
    updateUser.mockResolvedValue({
      error: { message: "New password should be different from the old password." },
    });

    expect(await chamar()).toEqual({ ok: false, error: "same_password" });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("falha genérica do GoTrue: update_failed, audita e NÃO derruba sessão", async () => {
    updateUser.mockResolvedValue({ error: { message: "boom" } });

    expect(await chamar()).toEqual({ ok: false, error: "update_failed" });
    expect(signOut).not.toHaveBeenCalled();
    expect(primeiro()).toMatchObject({ action: "auth.password_change_failed" });
  });
});
