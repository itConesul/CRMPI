/**
 * E2E — trocar a PRÓPRIA senha, já logado (issue #106), pela tela.
 *
 * O cenário é o de um primeiro deploy self-host: SEM `RESEND_API_KEY`. É onde a
 * recuperação por e-mail não funciona e onde o dono ficava sem caminho. Aqui a
 * troca tem de acontecer sem e-mail nenhum.
 *
 *  1. conta admin (seed via GoTrue admin API + provisionamento direto)
 *  2. a pessoa entra em DOIS aparelhos (dois contextos de navegador)
 *  3. no aparelho A: Configurações › Segurança › Senha
 *  4. senha atual ERRADA → recusada, nada muda, nada além do erro é revelado
 *  5. senha atual certa → "Senha alterada"; o aparelho A continua logado
 *  6. o aparelho B foi desconectado (a sessão dele foi encerrada)
 *  7. prova no banco: um `auth.password_changed`, sem nenhuma senha nos metadados
 *  8. sai e entra de novo: a senha ANTIGA falha, a NOVA entra
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { uniqueEmail, loadEnvLocal } from "./helpers/auth";

const email = uniqueEmail("troca-senha");
const senhaAntiga = "SenhaAntiga!123";
const senhaNova = "SenhaNova!456";

let admin: SupabaseClient;
let userId = "";

test.beforeAll(async () => {
  const envLocal = loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? envLocal.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? envLocal.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL/SERVICE_ROLE_KEY ausentes (.env.local)");

  admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: senhaAntiga,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`seed createUser: ${error?.message}`);
  userId = data.user.id;

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({
      slug: `e2e-troca-senha-${Date.now()}`,
      display_name: "Loja E2E Troca de Senha",
      legal_name: "Loja E2E Troca de Senha",
      status: "active",
      created_by: userId,
      // Já onboardada: o que se mede aqui é a troca de senha, não o wizard. Sem
      // isto o app manda a pessoa para /onboarding e a tela de Segurança nunca abre.
      onboarded_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (orgError || !org) throw new Error(`seed org: ${orgError?.message}`);

  const { error: memberError } = await admin.from("user_organizations").insert({
    user_id: userId,
    organization_id: org.id,
    role: "admin",
    accepted_at: new Date().toISOString(),
  });
  if (memberError) throw new Error(`seed membership: ${memberError.message}`);
});

async function entrar(page: Page, senha: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(app|onboarding)\//, { timeout: 30_000 });
}

test("trocar a própria senha pela tela, sem e-mail: outros aparelhos saem, a nova entra", async ({
  browser,
}) => {
  test.setTimeout(180_000);

  // 2. Dois aparelhos, cada um com a sua sessão.
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await entrar(a, senhaAntiga);
  await entrar(b, senhaAntiga);

  // B está logado de verdade: alcança uma tela do app.
  await b.goto("/app/settings/security");
  await expect(b.getByRole("heading", { name: "Segurança" })).toBeVisible();

  // 3. A porta existe: a tela de Segurança tem o formulário de senha.
  await a.goto("/app/settings/security");
  await expect(a.getByRole("heading", { name: "Segurança" })).toBeVisible();
  const form = a.getByTestId("troca-de-senha");
  await expect(form).toBeVisible();

  // 4. Senha atual ERRADA: recusada, e a mensagem não diz mais que o erro.
  await form.getByLabel("Senha atual").fill("nao-e-a-senha-1");
  await form.getByLabel("Nova senha", { exact: true }).fill(senhaNova);
  await form.getByLabel("Confirmar nova senha").fill(senhaNova);
  await form.getByRole("button", { name: "Trocar senha" }).click();
  await expect(form.getByRole("alert")).toHaveText("A senha atual está incorreta.");
  // Os três campos são limpos depois de uma recusa: senha não fica na tela.
  await expect(form.getByLabel("Senha atual")).toHaveValue("");
  await expect(form.getByLabel("Nova senha", { exact: true })).toHaveValue("");

  // 4b. Confirmação diferente: barrada no próprio formulário, sem ir ao servidor.
  await form.getByLabel("Senha atual").fill(senhaAntiga);
  await form.getByLabel("Nova senha", { exact: true }).fill(senhaNova);
  await form.getByLabel("Confirmar nova senha").fill("outra-coisa-999");
  await form.getByRole("button", { name: "Trocar senha" }).click();
  await expect(form.getByText("As senhas não coincidem")).toBeVisible();

  // 5. Senha atual certa.
  await form.getByLabel("Senha atual").fill(senhaAntiga);
  await form.getByLabel("Nova senha", { exact: true }).fill(senhaNova);
  await form.getByLabel("Confirmar nova senha").fill(senhaNova);
  await form.getByRole("button", { name: "Trocar senha" }).click();
  await expect(
    a.getByText("Senha alterada. Os outros aparelhos foram desconectados."),
  ).toBeVisible({ timeout: 30_000 });

  // O aparelho A segue logado: recarregar não manda para o login.
  await a.reload();
  await expect(a.getByRole("heading", { name: "Segurança" })).toBeVisible();
  await expect(a).not.toHaveURL(/\/login/);

  // 6. O aparelho B foi desconectado.
  await b.goto("/app/settings/security");
  await expect(b).toHaveURL(/\/login/, { timeout: 30_000 });

  // 7. Auditoria: uma troca registrada, e NENHUMA senha em lugar nenhum dela.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("api_audit_log")
          .select("action,metadata")
          .eq("actor_user_id", userId)
          .in("action", ["auth.password_changed", "auth.password_change_failed"]);
        return (data ?? []).map((r) => r.action).sort();
      },
      { timeout: 30_000 },
    )
    .toEqual(["auth.password_change_failed", "auth.password_changed"]);
  const { data: linhas } = await admin
    .from("api_audit_log")
    .select("action,metadata")
    .eq("actor_user_id", userId)
    .in("action", ["auth.password_changed", "auth.password_change_failed"]);
  const bruto = JSON.stringify(linhas);
  expect(bruto).not.toContain(senhaAntiga);
  expect(bruto).not.toContain(senhaNova);
  expect(bruto).not.toContain("nao-e-a-senha-1");
  expect(linhas?.find((l) => l.action === "auth.password_changed")?.metadata).toMatchObject({
    other_sessions_revoked: true,
    // Sem RESEND_API_KEY: a troca valeu sem tentar e-mail.
    email_dispatched: false,
  });

  // 8. Sai e entra de novo: a senha ANTIGA falha, a NOVA entra.
  await ctxA.clearCookies();
  const c = await browser.newContext();
  const p = await c.newPage();
  await p.goto("/login");
  await p.getByLabel("Email").fill(email);
  await p.getByLabel("Senha").fill(senhaAntiga);
  await p.getByRole("button", { name: "Entrar" }).click();
  await expect(p.getByText("Email ou senha incorretos.")).toBeVisible();

  await p.getByLabel("Senha").fill(senhaNova);
  await p.getByRole("button", { name: "Entrar" }).click();
  await p.waitForURL(/\/(app|onboarding)\//, { timeout: 30_000 });
  await expect(p).not.toHaveURL(/\/login/);

  await Promise.all([ctxA.close(), ctxB.close(), c.close()]);
});
