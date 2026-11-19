/**
 * O EXPEDIENTE BARRA A AÇÃO, NÃO A LEITURA — provado contra o app real (PRD-01 / #67).
 *
 * ## O que este spec prova que os unitários não provam
 * O gate é fail-closed e o `requireRole` NÃO conhece o método HTTP: é o `proxy.ts` que o carimba num
 * cabeçalho e o `requireRole` o lê por `headers()`. Os testes unitários simulam esse carimbo. Só um
 * app de produção buildado, com o proxy de verdade, prova que o carimbo CHEGA — e que um cliente
 * não o forja.
 *
 * ## O que ele NÃO prova
 * A faixa na tela e a página `/fora-de-expediente` (T7), a tela de configuração (T6) e o contador
 * de barrados: ainda não existem. Este spec cobre o servidor. Quando a T7 entrar, a prova pela
 * tela entra no `expediente-e-setor.spec.ts` planejado em `docs/specs/sdd/67-expediente-e-setor/`.
 *
 * ## Como o relógio é tratado
 * O fuso do expediente é UTC e as janelas são construídas em torno do relógio do teste:
 *  - "fora" = uma janela só num dia daqui a 3 dias: imune a uma virada de meia-noite no meio do teste;
 *  - "dentro" = `agora − 3 h` a `agora + 3 h` em todos os 7 dias, com virada de dia.
 *
 * Pré-requisitos (banco local, app buildada): os mesmos de `notificacoes-diz-o-que-falta.spec.ts`.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type APIResponse, type Page } from "@playwright/test";

import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");

interface Creds {
  password: string;
  org_id: string;
  users: Record<string, { id: string; email: string; role: string }>;
}

let creds: Creds;
let admin: SupabaseClient;
/** O `settings` da organização como estava, para devolver exatamente no fim. */
let settingsOriginal: Record<string, unknown> = {};

const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;

/** Expediente em que o servidor está FORA agora e continuará, mesmo se a meia-noite passar. */
function expedienteFora() {
  const dowDaquiA3Dias = (new Date().getUTCDay() + 3) % 7;
  return { timezone: "Etc/UTC", windows: [{ dow: dowDaquiA3Dias, start: "08:00", end: "18:00" }] };
}

/** Expediente em que o servidor está DENTRO agora (janela de ±3 h que pode virar o dia). */
function expedienteDentro() {
  const agora = new Date();
  const inicio = hhmm(new Date(agora.getTime() - 3 * 3_600_000));
  const fim = hhmm(new Date(agora.getTime() + 3 * 3_600_000));
  return {
    timezone: "Etc/UTC",
    windows: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, start: inicio, end: fim })),
  };
}

async function gravarExpediente(businessHours: unknown): Promise<void> {
  const settings = { ...settingsOriginal };
  if (businessHours === undefined) delete settings.business_hours;
  else settings.business_hours = businessHours;
  const { error } = await admin.from("organizations").update({ settings } as never).eq("id", creds.org_id);
  if (error) throw new Error(`gravar expediente: ${error.message}`);
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app/, { timeout: 60_000 });
}

async function codigoDoErro(r: APIResponse): Promise<string | undefined> {
  return ((await r.json().catch(() => ({}))) as { error?: { code?: string } }).error?.code;
}

test.describe("expediente barra a ação, não a leitura (servidor)", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test.beforeAll(async () => {
    if (!fs.existsSync(CREDS_PATH)) {
      throw new Error("Falta .e2e-creds.json — rode `pnpm exec tsx scripts/seed-e2e-credentials.ts`.");
    }
    creds = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
    const c = credenciaisSupabaseDeTeste();
    admin = createClient(c.url, c.serviceRole, { auth: { persistSession: false } });
    const { data, error } = await admin.from("organizations").select("settings").eq("id", creds.org_id).single();
    if (error) throw new Error(`ler settings: ${error.message}`);
    settingsOriginal = ((data as { settings: Record<string, unknown> | null }).settings ?? {}) as Record<string, unknown>;
  });

  test.afterAll(async () => {
    // Devolve a organização EXATAMENTE como estava: este spec nunca deixa expediente para trás.
    await admin.from("organizations").update({ settings: settingsOriginal } as never).eq("id", creds.org_id);
  });

  test("agent FORA do expediente: a escrita leva 403 OUT_OF_WORK_HOURS e a leitura continua", async ({ page }) => {
    await gravarExpediente(expedienteFora());
    await login(page, creds.users.agent!.email);

    // LEITURA: nunca é barrada — o atendente precisa ler o que entrou de madrugada.
    const leitura = await page.request.get("/api/v1/conversations");
    expect(leitura.status(), "GET de conversas fora do expediente").toBe(200);

    // ESCRITA em rota que NÃO é de conversa: o fail-closed cobre qualquer não-GET, não só conversations/**.
    // (corpo inválido de propósito: o 403 vem ANTES da validação, e dentro do expediente seria 4xx de body)
    const escrita = await page.request.post("/api/v1/tasks", { data: {} });
    expect(escrita.status(), "POST de tarefa fora do expediente").toBe(403);
    expect(await codigoDoErro(escrita)).toBe("OUT_OF_WORK_HOURS");
    const corpo = (await escrita.json()) as { error: { details?: { opens_at?: string | null } } };
    expect(corpo.error.details?.opens_at, "a resposta diz quando o expediente abre").toBeTruthy();
    expect(new Date(corpo.error.details!.opens_at!).getTime()).toBeGreaterThan(Date.now());
  });

  test("o carimbo do método NÃO é forjável: mandar `x-metodo-http: GET` num POST não abre o gate", async ({ page }) => {
    await gravarExpediente(expedienteFora());
    await login(page, creds.users.agent!.email);
    const r = await page.request.post("/api/v1/tasks", {
      data: {},
      headers: { "x-metodo-http": "GET" },
    });
    expect(r.status()).toBe(403);
    expect(await codigoDoErro(r)).toBe("OUT_OF_WORK_HOURS");
  });

  test("a isenção declarada vale: o atendente ainda gerencia a PRÓPRIA disponibilidade fora do expediente", async ({ page }) => {
    await gravarExpediente(expedienteFora());
    await login(page, creds.users.agent!.email);
    const r = await page.request.patch(`/api/v1/attendants/availability/${creds.users.agent!.id}`, {
      data: { is_available: false },
    });
    expect(await codigoDoErro(r), "a rota isenta não pode devolver OUT_OF_WORK_HOURS").not.toBe("OUT_OF_WORK_HOURS");
  });

  test("manager NUNCA é barrado pelo expediente, mesmo fora dele", async ({ page }) => {
    await gravarExpediente(expedienteFora());
    await login(page, creds.users.manager!.email);
    const r = await page.request.post("/api/v1/tasks", { data: {} });
    expect(await codigoDoErro(r), "manager fora do expediente").not.toBe("OUT_OF_WORK_HOURS");
  });

  test("agent DENTRO do expediente (janela que vira o dia): a mesma escrita não é barrada", async ({ page }) => {
    await gravarExpediente(expedienteDentro());
    await login(page, creds.users.agent!.email);
    const r = await page.request.post("/api/v1/tasks", { data: {} });
    expect(await codigoDoErro(r), "agent dentro do expediente").not.toBe("OUT_OF_WORK_HOURS");
  });

  test("[P0] instalação SEM expediente (o estado de toda instalação que atualiza): ninguém é barrado", async ({ page }) => {
    await gravarExpediente(undefined);
    await login(page, creds.users.agent!.email);
    const r = await page.request.post("/api/v1/tasks", { data: {} });
    expect(await codigoDoErro(r), "agent sem expediente configurado").not.toBe("OUT_OF_WORK_HOURS");
  });

  test("expediente TORTO nunca tranca a equipe (falha aberta)", async ({ page }) => {
    await gravarExpediente({ timezone: "Marte/Olympus", windows: "oito às seis" });
    await login(page, creds.users.agent!.email);
    const r = await page.request.post("/api/v1/tasks", { data: {} });
    expect(await codigoDoErro(r), "agent com expediente inválido").not.toBe("OUT_OF_WORK_HOURS");
  });
});
