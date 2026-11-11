/**
 * Issue #52 — o convite leva a pessoa ao caminho certo sem ela escolher, e quem
 * está sem organização não fica num /app vazio.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { destinoDoConvite } from "@/lib/auth/destino-do-convite";
import { signInviteToken, verifyInviteToken } from "@/lib/auth/invite-token";
import { portaSemOrganizacao } from "@/lib/auth/porta-sem-organizacao";

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));

import { contaExistePorEmail } from "@/lib/auth/conta-existe";

const ORG = "22222222-2222-4222-8222-222222222222";
const token = (email: string, exp = 2_000_000_000) =>
  signInviteToken({
    invite_id: "11111111-1111-4111-8111-111111111111",
    email,
    organization_id: ORG,
    role: "agent",
    exp,
  });

describe("destinoDoConvite", () => {
  it("guarda de vacuidade: o token de teste verifica", () => {
    expect(verifyInviteToken(token("a@b.test"))).not.toBeNull();
  });

  it("tem conta → login que volta ao convite, com o e-mail do convite", () => {
    const d = destinoDoConvite("tok", "ana@empresa.test", true);
    expect(d.tipo).toBe("entrar");
    if (d.tipo !== "escolher") {
      expect(d.href).toBe(
        `/login?next=${encodeURIComponent("/team/accept-invite/tok")}&email=ana%40empresa.test`,
      );
    }
  });

  it("não tem conta → cadastro com o token do convite", () => {
    expect(destinoDoConvite("tok", "ana@empresa.test", false)).toEqual({
      tipo: "cadastrar",
      href: "/signup?invite=tok",
    });
  });

  it("não soube responder → oferece as duas portas, não adivinha", () => {
    expect(destinoDoConvite("tok", "ana@empresa.test", null)).toEqual({ tipo: "escolher" });
  });
});

describe("contaExistePorEmail", () => {
  beforeEach(() => rpc.mockReset());

  it("repassa o booleano do banco", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });
    expect(await contaExistePorEmail("a@b.test")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("fn_conta_existe_por_email", { p_email: "a@b.test" });
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await contaExistePorEmail("a@b.test")).toBe(false);
  });

  it("erro da consulta → null (nunca lança)", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect(await contaExistePorEmail("a@b.test")).toBeNull();
  });

  it("exceção → null (a tela do convite não pode dar 500)", async () => {
    rpc.mockRejectedValueOnce(new Error("rede"));
    expect(await contaExistePorEmail("a@b.test")).toBeNull();
  });

  it("resposta que não é booleano → null", async () => {
    rpc.mockResolvedValueOnce({ data: "sim", error: null });
    expect(await contaExistePorEmail("a@b.test")).toBeNull();
  });
});

describe("portaSemOrganizacao", () => {
  it("convite válido para este e-mail → aceite do convite", () => {
    const t = token("ana@empresa.test");
    expect(
      portaSemOrganizacao({ email: "ana@empresa.test", user_metadata: { invite_token: t } }),
    ).toBe(`/team/accept-invite/${t}`);
  });

  it("convite de OUTRO e-mail → recusa, sem abrir empresa", () => {
    const t = token("outra@empresa.test");
    expect(
      portaSemOrganizacao({ email: "ana@empresa.test", user_metadata: { invite_token: t } }),
    ).toBe("/login?error=convite_invalido");
  });

  it("convite expirado → recusa, sem abrir empresa", () => {
    const t = token("ana@empresa.test", 1_000_000_000);
    expect(
      portaSemOrganizacao({ email: "ana@empresa.test", user_metadata: { invite_token: t } }),
    ).toBe("/login?error=convite_invalido");
  });

  it("sem convite → /get-started", () => {
    expect(portaSemOrganizacao({ email: "ana@empresa.test", user_metadata: {} })).toBe(
      "/get-started",
    );
    expect(portaSemOrganizacao({ email: "ana@empresa.test" })).toBe("/get-started");
  });
});
