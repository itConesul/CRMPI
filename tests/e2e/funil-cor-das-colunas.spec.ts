/**
 * E2E — o dono do funil renomeia as colunas e escolhe a cor do cabeçalho (#124).
 *
 * Jornada, pela tela, como uma pessoa faria:
 *
 *  1. admin abre Configurações › Etapas do funil
 *  2. renomeia uma coluna
 *  3. escolhe uma cor para ela numa lista fixa
 *  4. abre o quadro: o cabeçalho está PINTADO, tem o nome novo, e o texto por cima
 *     passa de 4,5:1 (medido por ferramenta no navegador, não a olho)
 *  5. a coluna sem cor continua com o aspecto de sempre
 *  6. «Sem cor» devolve o cabeçalho ao aspecto de fábrica
 *  7. recusas: papel `agent` não entra na tela nem na API, e cor fora da paleta é barrada
 *
 * O funil vem do gatilho `trg_seed_default_pipeline_for_org`, que semeia um em toda
 * organização nova — é o estado de uma instalação fresca.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { uniqueEmail, loadEnvLocal } from "./helpers/auth";

const EVIDENCIA = path.join(process.cwd(), ".superpowers", "evidence");
const senha = "SenhaDoFunil!123";
const emailAdmin = uniqueEmail("funil-cor-admin");
const emailAgent = uniqueEmail("funil-cor-agent");
const NOME_NOVO = `Primeiro contato ${Date.now()}`;

let db: SupabaseClient;
let pipelineId = "";
let colorida: { id: string; name: string } = { id: "", name: "" };
let semCor: { id: string; name: string } = { id: "", name: "" };

test.beforeAll(async () => {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  const envLocal = loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? envLocal.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? envLocal.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL/SERVICE_ROLE_KEY ausentes (.env.local)");

  db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const criar = async (email: string) => {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`seed createUser: ${error?.message}`);
    return data.user.id;
  };
  const adminId = await criar(emailAdmin);
  const agentId = await criar(emailAgent);

  const { data: org, error: orgError } = await db
    .from("organizations")
    .insert({
      slug: `e2e-funil-cor-${Date.now()}`,
      display_name: "Loja E2E Cor do Funil",
      legal_name: "Loja E2E Cor do Funil",
      status: "active",
      created_by: adminId,
      // Já onboardada: o que se mede aqui é o funil, não o wizard.
      onboarded_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (orgError || !org) throw new Error(`seed org: ${orgError?.message}`);

  for (const [userId, role] of [
    [adminId, "admin"],
    [agentId, "agent"],
  ] as const) {
    const { error } = await db.from("user_organizations").insert({
      user_id: userId,
      organization_id: org.id,
      role,
      accepted_at: new Date().toISOString(),
    });
    if (error) throw new Error(`seed membership ${role}: ${error.message}`);
  }

  // O funil de fábrica, semeado pelo gatilho da organização.
  const { data: funis } = await db
    .from("crm_pipelines")
    .select("id")
    .eq("organization_id", org.id)
    .eq("is_archived", false)
    .order("position");
  if (!funis?.[0]) throw new Error("a organização nasceu sem funil de fábrica");
  pipelineId = funis[0].id as string;

  const { data: etapas } = await db
    .from("crm_stages")
    .select("id, name, color")
    .eq("pipeline_id", pipelineId)
    .eq("is_archived", false)
    .order("position");
  if (!etapas || etapas.length < 2) throw new Error("o funil de fábrica tem menos de 2 etapas");
  colorida = { id: etapas[0]!.id as string, name: etapas[0]!.name as string };
  semCor = { id: etapas[1]!.id as string, name: etapas[1]!.name as string };

  // Ponto de partida conhecido: nenhuma das duas tem cor, qualquer que seja o seed.
  await db.from("crm_stages").update({ color: null }).in("id", [colorida.id, semCor.id]);
});

async function entrar(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(app|onboarding)\//, { timeout: 30_000 });
}

async function corNoBanco(stageId: string): Promise<string | null> {
  const { data } = await db.from("crm_stages").select("color").eq("id", stageId).single();
  return (data?.color as string | null) ?? null;
}

/** Espera o PATCH da etapa voltar 200 enquanto `acao` roda. */
async function salvandoEtapa(page: Page, stageId: string, acao: () => Promise<void>) {
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes(`/stages/${stageId}`) && r.request().method() === "PATCH" && r.ok(),
      { timeout: 30_000 },
    ),
    acao(),
  ]);
}

test("o dono renomeia e colore uma coluna; o quadro pinta o cabeçalho com texto legível", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await entrar(page, emailAdmin);

  // 1. A tela de configuração das etapas.
  await page.goto("/app/settings/tenant/pipelines");
  await expect(page.getByRole("heading", { name: "Etapas do funil" })).toBeVisible();
  await expect(page.getByTestId(`cor-${colorida.id}`)).toBeVisible();
  // Sem cor nenhuma ainda: o seletor diz isso.
  await expect(page.getByTestId(`cor-${colorida.id}`)).toHaveText(/Sem cor/);

  // 2. Renomear (salva ao confirmar).
  const campo = page.getByTestId(`nome-${colorida.id}`);
  await salvandoEtapa(page, colorida.id, async () => {
    await campo.fill(NOME_NOVO);
    await campo.press("Enter");
  });

  // 3. Escolher a cor numa lista fixa.
  await page.getByTestId(`cor-${colorida.id}`).click();
  await expect(page.getByRole("option", { name: "Sem cor", exact: true })).toBeVisible();
  await salvandoEtapa(page, colorida.id, async () => {
    await page.getByRole("option", { name: "Azul", exact: true }).click();
  });
  await expect(page.getByTestId(`cor-${colorida.id}`)).toHaveText(/Azul/);
  await page.screenshot({ path: path.join(EVIDENCIA, "funil-cor-01-configuracao.png"), fullPage: true });

  // No banco: a forma exata que a paleta define.
  expect(await corNoBanco(colorida.id)).toBe("#1d4ed8");

  // 4. O quadro: cabeçalho pintado, com o nome novo, e texto legível MEDIDO.
  await page.goto(`/app/pipelines/${pipelineId}`);
  const cabecalho = page.getByTestId(`cabecalho-${colorida.id}`);
  await expect(cabecalho).toBeVisible({ timeout: 30_000 });
  await expect(cabecalho.getByRole("heading", { name: NOME_NOVO })).toBeVisible();

  const medida = await cabecalho.evaluate((el) => {
    const css = getComputedStyle(el);
    const canais = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = (rgb: number[]) => {
      const [r, g, b] = rgb.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const fundo = canais(css.backgroundColor);
    const texto = canais(css.color);
    const [a, b] = [lum(fundo), lum(texto)];
    return {
      fundo: css.backgroundColor,
      texto: css.color,
      razao: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
    };
  });
  expect(medida.fundo).toBe("rgb(29, 78, 216)");
  expect(medida.texto).toBe("rgb(255, 255, 255)");
  expect(medida.razao).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({ path: path.join(EVIDENCIA, "funil-cor-02-quadro-pintado.png"), fullPage: true });

  // 5. A coluna sem cor continua com o aspecto de sempre: fundo transparente.
  const semPintura = page.getByTestId(`cabecalho-${semCor.id}`);
  await expect(semPintura).toBeVisible();
  expect(await semPintura.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    "rgba(0, 0, 0, 0)",
  );

  // 6. «Sem cor» devolve o aspecto de fábrica.
  await page.goto("/app/settings/tenant/pipelines");
  await page.getByTestId(`cor-${colorida.id}`).click();
  await salvandoEtapa(page, colorida.id, async () => {
    await page.getByRole("option", { name: "Sem cor", exact: true }).click();
  });
  expect(await corNoBanco(colorida.id)).toBeNull();
  await page.goto(`/app/pipelines/${pipelineId}`);
  const volta = page.getByTestId(`cabecalho-${colorida.id}`);
  await expect(volta).toBeVisible({ timeout: 30_000 });
  expect(await volta.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    "rgba(0, 0, 0, 0)",
  );

  // 7b. Cor fora da paleta é barrada pela API, e o banco não muda.
  const fora = await page.request.patch(`/api/v1/pipelines/${pipelineId}/stages/${colorida.id}`, {
    data: { color: "#fde68a" },
  });
  expect(fora.status()).toBe(422);
  expect(await corNoBanco(colorida.id)).toBeNull();

  await ctx.close();
});

test("quem é só agent não configura as colunas: nem pela tela, nem pela API", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await entrar(page, emailAgent);

  await page.goto("/app/settings/tenant/pipelines");
  await expect(page).toHaveURL(/\/403/, { timeout: 30_000 });

  const r = await page.request.patch(`/api/v1/pipelines/${pipelineId}/stages/${colorida.id}`, {
    data: { color: "#b91c1c" },
  });
  expect(r.status()).toBe(403);
  expect(await corNoBanco(colorida.id)).toBeNull();

  await ctx.close();
});
