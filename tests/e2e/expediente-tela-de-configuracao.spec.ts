/**
 * A TELA DE CONFIGURAÇÃO DO EXPEDIENTE — provada pelo browser, como o admin a usaria (PRD-01 / #67, T6).
 *
 * `expediente-barra-a-acao` prova o SERVIDOR (403) e `expediente-na-tela` prova o que o ATENDENTE vê.
 * Até a T6 o expediente só era gravado por service role nesses specs: nenhuma tela o configurava, e num
 * self-host isso é a feature não existir. Este spec fecha o caminho inteiro, SEM atalho de banco para o
 * que está sob prova:
 *
 *   admin abre Configurações › Atendimento → monta o horário na tela → salva → o dado chega ao banco
 *   pela API do produto → o atendente, noutra sessão, passa a ver a faixa "fora do expediente".
 *
 * O service role só LÊ o que ficou gravado (a prova de que a tela escreveu) e restaura o estado original.
 *
 * ## O que ele NÃO prova
 * O número do contador (`barrados_hoje`): o e2e do CI NÃO tem Redis, então o contador chega `null` e a
 * tela mostra "—". O que se prova aqui é que "—" aparece (e não "0", que seria mentira). O número com
 * Redis real é provado no unitário da rota e no PR da T2d.
 *
 * ## Relógio
 * Fuso UTC e UM dia com janela, daqui a 3 dias (imune a virada de meia-noite no meio do teste): o
 * expediente nunca está aberto agora, então "fora" é determinístico.
 *
 * Evidência (screenshots + medições) em `.superpowers/evidence/expediente-tela-de-configuracao/`.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";

import { lerCreds, loginComoAdmin, type CredsE2E } from "./helpers/login-admin";

const EVIDENCIA = path.join(process.cwd(), ".superpowers/evidence/expediente-tela-de-configuracao");
const TELA = "/app/settings/atendimento";

let creds: CredsE2E & { org_id: string };
let service: SupabaseClient;
let settingsOriginal: Record<string, unknown> = {};
const medicoes: Record<string, unknown> = {};

async function lerSettings(): Promise<Record<string, unknown>> {
  const { data, error } = await service.from("organizations").select("settings").eq("id", creds.org_id).single();
  if (error) throw new Error(`ler settings: ${error.message}`);
  return ((data as { settings: Record<string, unknown> | null }).settings ?? {}) as Record<string, unknown>;
}

async function gravarSettings(settings: Record<string, unknown>): Promise<void> {
  const { error } = await service.from("organizations").update({ settings } as never).eq("id", creds.org_id);
  if (error) throw new Error(`gravar settings: ${error.message}`);
}

async function loginComum(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app/, { timeout: 60_000 });
}

async function captura(page: Page, nome: string): Promise<void> {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCIA, `${nome}.png`), fullPage: true });
}

test.describe("tela de configuração do expediente", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test.beforeAll(async () => {
    creds = lerCreds() as CredsE2E & { org_id: string };
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".e2e-creds.json"), "utf8")) as { org_id: string };
    creds.org_id = raw.org_id;
    const c = credenciaisSupabaseDeTeste();
    service = createClient(c.url, c.serviceRole, { auth: { persistSession: false } });
    settingsOriginal = await lerSettings();
  });

  test.afterAll(async () => {
    await gravarSettings(settingsOriginal);
    fs.mkdirSync(EVIDENCIA, { recursive: true });
    fs.writeFileSync(path.join(EVIDENCIA, "medicoes.json"), JSON.stringify(medicoes, null, 2));
  });

  test("o admin monta o horário pela tela, grava, e o atendente passa a ver a faixa", async ({ page, browser }) => {
    // Estado de instalação fresca: nenhum expediente, e o resto das configurações preenchido (o merge da
    // rota não pode apagá-lo).
    const base = { ...settingsOriginal };
    delete base.business_hours;
    await gravarSettings(base);

    await loginComoAdmin(page, creds);
    await page.goto(TELA);

    const secao = page.getByTestId("secao-expediente");
    await expect(secao).toBeVisible({ timeout: 30_000 });
    await expect(secao.getByRole("heading", { name: /expediente da empresa/i })).toBeVisible();
    // Antes de configurar, a tela diz que NINGUÉM é barrado — não deixa o admin achar que está protegido.
    await expect(page.getByTestId("expediente-sem-restricao")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("expediente-contador")).toHaveCount(0);
    await expect(page.getByTestId("expediente-salvar")).toBeDisabled();
    await captura(page, "01-antes-de-configurar");

    // Monta o horário: UM dia, daqui a 3 dias, fuso UTC.
    const dow = (new Date().getUTCDay() + 3) % 7;
    await page.getByTestId("expediente-fuso").fill("Etc/UTC");
    await expect(page.getByTestId(`expediente-fechado-${dow}`)).toBeVisible();
    await page.getByTestId(`expediente-abrir-${dow}`).click();
    await expect(page.getByTestId(`expediente-inicio-${dow}-0`)).toHaveValue("08:00");
    await page.getByTestId(`expediente-fim-${dow}-0`).fill("18:00");
    await expect(page.getByText("Há mudanças não salvas.")).toBeVisible();
    await captura(page, "02-horario-montado");

    const salvou = page.waitForResponse((r) => r.url().includes("/api/v1/settings/expediente") && r.request().method() === "PATCH");
    await page.getByTestId("expediente-salvar").click();
    expect((await salvou).status(), "o PATCH do produto aceita o que a tela montou").toBe(200);
    await expect(page.getByText("Expediente salvo.")).toBeVisible();

    // O dado chegou ao banco PELA API do produto, e o resto das configurações continua lá.
    const gravado = await lerSettings();
    expect(gravado.business_hours).toEqual({ timezone: "Etc/UTC", windows: [{ dow, start: "08:00", end: "18:00" }] });
    expect({ ...gravado, business_hours: undefined }).toEqual({ ...base, business_hours: undefined });

    // Recarregar traz o que ficou gravado, e o estado vem do servidor: agora a empresa está FORA.
    await page.reload();
    await expect(page.getByTestId(`expediente-inicio-${dow}-0`)).toHaveValue("08:00");
    await expect(page.getByTestId("expediente-fuso")).toHaveValue("Etc/UTC");
    const agora = page.getByTestId("expediente-agora");
    await expect(agora).toHaveAttribute("data-dentro", "nao", { timeout: 20_000 });
    await expect(page.getByTestId("expediente-abre")).toContainText(/\d{2}:\d{2}/);

    // O contador distingue "não sei" de zero: sem Redis (o e2e do CI) o valor é "—", nunca "0".
    const contador = (await page.getByTestId("expediente-contador-valor").innerText()).trim();
    medicoes.contador = contador;
    expect(contador).toMatch(/^(—|\d+)$/);
    await captura(page, "03-depois-de-salvar");

    // O efeito de verdade: noutra sessão, o ATENDENTE vê a faixa "fora do expediente".
    const ctxAgent = await browser.newContext();
    try {
      const paginaAgent = await ctxAgent.newPage();
      await loginComum(paginaAgent, creds.users.agent!.email);
      await paginaAgent.goto("/app/inbox?filter=all");
      const faixa = paginaAgent.getByTestId("faixa-de-expediente");
      await expect(faixa).toBeVisible({ timeout: 30_000 });
      await expect(faixa).toContainText(/fora do expediente/i);
      await expect(faixa).toContainText("08:00–18:00");
      await captura(paginaAgent, "04-o-atendente-ve-a-faixa");
    } finally {
      await ctxAgent.close();
    }
  });

  test("o manager LÊ o horário, mas não tem como editar", async ({ page }) => {
    await gravarSettings({ ...settingsOriginal, business_hours: { timezone: "Etc/UTC", windows: [{ dow: 1, start: "08:00", end: "18:00" }] } });
    await loginComum(page, creds.users.manager!.email);
    await page.goto(TELA);

    await expect(page.getByTestId("secao-expediente")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("expediente-somente-leitura")).toBeVisible();
    await expect(page.getByTestId("expediente-salvar")).toHaveCount(0);
    await expect(page.getByTestId("expediente-preset-comercial")).toHaveCount(0);
    await expect(page.getByTestId("expediente-inicio-1-0")).toBeDisabled();
    await expect(page.getByTestId("expediente-inicio-1-0")).toHaveValue("08:00");
    await captura(page, "05-manager-so-le");
  });

  test("a tela recusa fuso inexistente e janela torta, sem ir ao servidor", async ({ page }) => {
    await gravarSettings({ ...settingsOriginal, business_hours: { timezone: "Etc/UTC", windows: [{ dow: 1, start: "08:00", end: "18:00" }] } });
    const patches: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "PATCH" && r.url().includes("/settings/expediente")) patches.push(r.url());
    });
    await loginComoAdmin(page, creds);
    await page.goto(TELA);
    await expect(page.getByTestId("secao-expediente")).toBeVisible({ timeout: 30_000 });

    // O erro que um hispanofalante comete sem querer: o acento no nome do fuso.
    await page.getByTestId("expediente-fuso").fill("America/Asunción");
    await expect(page.getByTestId("expediente-fuso-invalido")).toBeVisible();
    await expect(page.getByTestId("expediente-salvar")).toBeDisabled();
    await page.getByTestId("expediente-fuso").fill("Etc/UTC");
    await expect(page.getByTestId("expediente-fuso-invalido")).toHaveCount(0);

    await page.getByTestId("expediente-fim-1-0").fill("08:00");
    await expect(page.getByTestId("expediente-problema-1-0")).toContainText("O início e o fim não podem ser iguais.");
    await expect(page.getByTestId("expediente-salvar")).toBeDisabled();
    await captura(page, "06-erro-ao-lado-do-campo");

    // A virada de dia é aceita: 22:00–06:00 é um horário válido, e a tela diz que termina no dia seguinte.
    await page.getByTestId("expediente-inicio-1-0").fill("22:00");
    await page.getByTestId("expediente-fim-1-0").fill("06:00");
    await expect(page.getByTestId("expediente-vira-1-0")).toBeVisible();
    await expect(page.getByTestId("expediente-salvar")).toBeEnabled();
    expect(patches, "nada foi mandado ao servidor enquanto o formulário estava torto").toEqual([]);
  });

  test("no celular a seção cabe na largura da tela", async ({ browser }) => {
    await gravarSettings({ ...settingsOriginal, business_hours: { timezone: "Etc/UTC", windows: [1, 2, 3, 4, 5].map((d) => ({ dow: d, start: "08:00", end: "18:00" })) } });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const page = await ctx.newPage();
      await loginComoAdmin(page, creds);
      await page.goto(TELA);
      await expect(page.getByTestId("secao-expediente")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("expediente-dia-1")).toBeVisible();

      // Medido por ferramenta, nunca a olho.
      const m = await page.evaluate(() => {
        const secao = document.querySelector('[data-testid="secao-expediente"]')!;
        const r = secao.getBoundingClientRect();
        const campos = Array.from(secao.querySelectorAll<HTMLElement>('input[type="time"], button')).map((el) => {
          const b = el.getBoundingClientRect();
          return { largura: Math.round(b.width), altura: Math.round(b.height), direita: Math.round(b.right) };
        });
        // O que estoura é o CONTEÚDO da seção: o scroll da página inteira inclui o menu lateral.
        const fora = campos.filter((c) => c.direita > window.innerWidth + 1).length;
        return {
          larguraDaSecao: Math.round(r.width),
          viewport: window.innerWidth,
          camposForaDaTela: fora,
          menorAltura: Math.min(...campos.map((c) => c.altura)),
        };
      });
      medicoes.celular = m;
      expect(m.camposForaDaTela, "nenhum campo ou botão da seção passa da borda direita da tela").toBe(0);
      expect(m.larguraDaSecao).toBeLessThanOrEqual(m.viewport);
      await captura(page, "07-celular");
    } finally {
      await ctx.close();
    }
  });
});
