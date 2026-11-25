/**
 * O RF-10 PROVADO NA LINHA GRAVADA (PRD-01 / #67, T2c): quando `admin`/`manager` agem FORA do
 * expediente, a linha de `api_audit_log` da mutação ganha `metadata.fora_do_expediente = true`.
 *
 * O que se prova aqui, e que o unitário (`lib/audit/index.test.ts`) não enxerga: a marca chega à
 * linha REAL, no banco, a partir de uma requisição real (build de produção, Supabase local) — por uma
 * rota `void audit()` (as 125 chamadas fire-and-forget), por uma Server Action de `admin`
 * (`updateTenant`, pela tela) e pela rota isenta do `agent`, que NUNCA marca.
 *
 * ## Por que o expediente é mudado pela API do produto e não pelo banco
 * O `audit()` guarda o expediente em cache por 30 s (só dele; o gate lê direto). Gravar o expediente
 * por service role deixaria o processo com o valor ANTIGO durante o TTL, e o teste marcaria errado. O
 * `PATCH /api/v1/settings/expediente` descarta a entrada do cache no mesmo processo (`next start` é
 * um só), então usá-lo é o caminho real E prova o descarte de ponta a ponta. A organização é devolvida
 * ao estado original por service role no fim (depois do último teste, o cache não importa).
 *
 * ## O que NÃO prova
 * Outro processo (worker, outra instância) só enxerga a mudança depois do TTL: aceito pelo dono e
 * coberto no unitário do cache. Tampouco prova a sessão de suporte nem o platform admin (unitário).
 *
 * Evidência em `.superpowers/evidence/expediente-audit-fora-do-horario/`.
 */
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";
import { afirmarAdminDeTenantPuro } from "./utils/precondicao";
import { generateTotp, msUntilNextTotpWindow } from "./utils/totp";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
const EVIDENCIA = path.join(process.cwd(), ".superpowers/evidence/expediente-audit-fora-do-horario");
const ESPERA = 60_000;

interface Creds {
  password: string;
  org_id: string;
  users: Record<string, { id: string; email: string }>;
  admin_totp?: { factor_id: string; secret: string };
  app_url?: string;
}

let creds: Creds;
let admin: SupabaseClient;
let settingsOriginal: Record<string, unknown> = {};
let paginaAdmin: Page;
const medicoes: Record<string, unknown> = {};

const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;

/** Uma janela só, num dia daqui a 3 dias: imune a uma virada de meia-noite no meio do teste. */
const expedienteFora = () => ({
  timezone: "Etc/UTC",
  windows: [{ dow: (new Date().getUTCDay() + 3) % 7, start: "08:00", end: "18:00" }],
});

function expedienteDentro() {
  const agora = new Date();
  const inicio = hhmm(new Date(agora.getTime() - 3 * 3_600_000));
  const fim = hhmm(new Date(agora.getTime() + 3 * 3_600_000));
  return { timezone: "Etc/UTC", windows: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, start: inicio, end: fim })) };
}

async function login(page: Page, email: string): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app/, { timeout: ESPERA });
}

async function loginComTotp(page: Page, email: string, secret: string): Promise<void> {
  await page.goto("/login");
  await expect(page.locator("#email")).toBeVisible({ timeout: ESPERA });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/login\/mfa/, { timeout: ESPERA });
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    if (msUntilNextTotpWindow() < 3_000) await page.waitForTimeout(msUntilNextTotpWindow() + 200);
    await page.locator('input[aria-label="Dígito 1"]').click();
    await page.keyboard.type(generateTotp(secret), { delay: 40 });
    try {
      await page.waitForURL(/\/app\//, { timeout: 20_000 });
      return;
    } catch {
      await page.waitForTimeout(msUntilNextTotpWindow() + 200);
    }
  }
  throw new Error("MFA falhou depois de 3 tentativas de TOTP");
}

/** Muda o expediente pela API do PRODUTO (descarta o cache do audit() no mesmo processo). */
async function definirExpediente(config: unknown): Promise<void> {
  const res = await paginaAdmin.request.patch("/api/v1/settings/expediente", { data: config });
  expect(res.status(), `PATCH /settings/expediente: ${await res.text()}`).toBe(200);
}

interface LinhaDeAudit {
  action: string;
  actor_user_id: string | null;
  metadata: Record<string, unknown>;
}

/** A linha que o `void audit()` grava DEPOIS de a resposta sair: espera ela existir. */
async function linhaPorRequestId(requestId: string, action: string): Promise<LinhaDeAudit> {
  let achada: LinhaDeAudit | undefined;
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("api_audit_log")
          .select("action, actor_user_id, metadata")
          .eq("request_id", requestId)
          .eq("action", action)
          .limit(1);
        achada = (data as LinhaDeAudit[] | null)?.[0];
        return achada !== undefined;
      },
      { timeout: 20_000, message: `a linha ${action} (${requestId}) nunca apareceu em api_audit_log` },
    )
    .toBe(true);
  return achada!;
}

/** Disponibilidade do PRÓPRIO usuário: rota `void audit()`, isenta para o `agent`. */
async function mudarDisponibilidade(page: Page, userId: string): Promise<{ status: number; requestId: string }> {
  const requestId = randomUUID();
  const res = await page.request.patch(`/api/v1/attendants/availability/${userId}`, {
    data: { is_available: true },
    headers: { "x-request-id": requestId },
  });
  return { status: res.status(), requestId };
}

/** Os ids das linhas `org.updated` do admin que JÁ existem: a do teste anterior nunca pode ser confundida com a nova. */
async function idsDeOrgUpdated(): Promise<Set<string>> {
  const { data } = await admin
    .from("api_audit_log")
    .select("id")
    .eq("organization_id", creds.org_id)
    .eq("action", "org.updated")
    .eq("actor_user_id", creds.users.admin!.id);
  return new Set(((data ?? []) as Array<{ id: string }>).map((l) => l.id));
}

/** A linha `org.updated` NOVA (id que não estava em `jaExistiam`), gravada pela Server Action depois do clique. */
async function novaLinhaDeOrgUpdated(jaExistiam: Set<string>): Promise<LinhaDeAudit> {
  let achada: LinhaDeAudit | undefined;
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("api_audit_log")
          .select("id, action, actor_user_id, metadata")
          .eq("organization_id", creds.org_id)
          .eq("action", "org.updated")
          .eq("actor_user_id", creds.users.admin!.id)
          .order("created_at", { ascending: false })
          .limit(10);
        achada = ((data ?? []) as Array<LinhaDeAudit & { id: string }>).find((l) => !jaExistiam.has(l.id));
        return achada !== undefined;
      },
      { timeout: 20_000, message: "a linha org.updated NOVA da Server Action nunca apareceu" },
    )
    .toBe(true);
  return achada!;
}

const marcada = (l: LinhaDeAudit) => l.metadata.fora_do_expediente === true;
const semCampo = (l: LinhaDeAudit) => !("fora_do_expediente" in l.metadata);

test.describe("RF-10: o audit() marca a ação fora do expediente", () => {
  test.describe.configure({ mode: "serial", timeout: 240_000 });

  test.beforeAll(async ({ browser }) => {
    if (!fs.existsSync(CREDS_PATH)) throw new Error("Falta .e2e-creds.json — rode `pnpm exec tsx scripts/seed-e2e-credentials.ts`.");
    creds = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
    expect(creds.admin_totp?.secret, "o seed deve gravar admin_totp").toBeTruthy();
    await afirmarAdminDeTenantPuro(creds.users.admin!.email);
    const c = credenciaisSupabaseDeTeste();
    admin = createClient(c.url, c.serviceRole, { auth: { persistSession: false } });
    const { data, error } = await admin.from("organizations").select("settings").eq("id", creds.org_id).single();
    if (error) throw new Error(`ler settings: ${error.message}`);
    settingsOriginal = ((data as { settings: Record<string, unknown> | null }).settings ?? {}) as Record<string, unknown>;

    // A sessão do admin que muda o expediente pela API (e é a do teste da Server Action).
    // `browser.newContext()` NÃO herda o `baseURL` da configuração: vem das credenciais do seed.
    const contexto = await browser.newContext({ baseURL: creds.app_url ?? "http://localhost:3001" });
    paginaAdmin = await contexto.newPage();
    await loginComTotp(paginaAdmin, creds.users.admin!.email, creds.admin_totp!.secret);
  });

  test.afterAll(async () => {
    // Devolve a organização EXATAMENTE como estava (por service role: o cache já não importa).
    await admin.from("organizations").update({ settings: settingsOriginal } as never).eq("id", creds.org_id);
    fs.mkdirSync(EVIDENCIA, { recursive: true });
    fs.writeFileSync(path.join(EVIDENCIA, "medicoes.json"), JSON.stringify(medicoes, null, 2));
    await paginaAdmin?.context().close();
  });

  test("manager FORA do expediente, rota `void audit()`: a linha SAI marcada", async ({ page }) => {
    await definirExpediente(expedienteFora());
    await login(page, creds.users.manager!.email);
    const { status, requestId } = await mudarDisponibilidade(page, creds.users.manager!.id);
    expect(status).toBe(200);
    const linha = await linhaPorRequestId(requestId, "attendant.availability_changed");
    expect(marcada(linha), `metadata: ${JSON.stringify(linha.metadata)}`).toBe(true);
    expect(linha.actor_user_id).toBe(creds.users.manager!.id);
    // A marca vai NA linha que já seria gravada: continua uma linha só por mutação.
    const { count } = await admin.from("api_audit_log").select("id", { count: "exact", head: true }).eq("request_id", requestId);
    expect(count).toBe(1);
    medicoes.managerFora = linha.metadata;
  });

  test("agent FORA do expediente, na rota ISENTA: a mutação passa e a linha sai SEM marca (agent nunca marca)", async ({ page }) => {
    await login(page, creds.users.agent!.email);
    const { status, requestId } = await mudarDisponibilidade(page, creds.users.agent!.id);
    expect(status, "a rota isenta não pode devolver OUT_OF_WORK_HOURS").toBe(200);
    const linha = await linhaPorRequestId(requestId, "attendant.availability_changed");
    expect(semCampo(linha), `metadata: ${JSON.stringify(linha.metadata)}`).toBe(true);
    medicoes.agentFora = linha.metadata;
  });

  test("a marca não é forjável: mandar `x-request-id` ou cabeçalhos não a cria nem a remove", async ({ page }) => {
    // Sem expediente de teste novo: continua FORA. O agent manda um cabeçalho que tenta se passar por escrita
    // marcada; a marca só nasce no audit(), então a linha do agent segue sem ela.
    await login(page, creds.users.agent!.email);
    const requestId = randomUUID();
    const res = await page.request.patch(`/api/v1/attendants/availability/${creds.users.agent!.id}`, {
      data: { is_available: true },
      headers: { "x-request-id": requestId, "x-metodo-http": "POST", "x-fora-do-expediente": "true" },
    });
    expect(res.status()).toBe(200);
    const linha = await linhaPorRequestId(requestId, "attendant.availability_changed");
    expect(semCampo(linha)).toBe(true);
  });

  test("manager DENTRO do expediente: a linha sai SEM o campo", async ({ page }) => {
    await definirExpediente(expedienteDentro());
    await login(page, creds.users.manager!.email);
    const { status, requestId } = await mudarDisponibilidade(page, creds.users.manager!.id);
    expect(status).toBe(200);
    const linha = await linhaPorRequestId(requestId, "attendant.availability_changed");
    expect(semCampo(linha), `metadata: ${JSON.stringify(linha.metadata)}`).toBe(true);
    medicoes.managerDentro = linha.metadata;
  });

  test("admin FORA do expediente, SERVER ACTION (`updateTenant`, pela tela): a linha `org.updated` SAI marcada", async () => {
    await definirExpediente(expedienteFora());
    const jaExistiam = await idsDeOrgUpdated();
    await paginaAdmin.goto("/app/settings/tenant");
    const salvar = paginaAdmin.getByRole("button", { name: /^salvar$/i });
    await expect(salvar).toBeVisible({ timeout: ESPERA });
    await salvar.click();
    await expect(paginaAdmin.getByText(/organização atualizada/i).first()).toBeVisible({ timeout: 30_000 });

    const linha = await novaLinhaDeOrgUpdated(jaExistiam);
    expect(marcada(linha), `metadata: ${JSON.stringify(linha.metadata)}`).toBe(true);
    medicoes.adminForaServerAction = linha.metadata;
  });

  test("admin DENTRO do expediente, Server Action: a linha `org.updated` sai SEM o campo", async () => {
    await definirExpediente(expedienteDentro());
    const jaExistiam = await idsDeOrgUpdated();
    await paginaAdmin.goto("/app/settings/tenant");
    const salvar = paginaAdmin.getByRole("button", { name: /^salvar$/i });
    await expect(salvar).toBeVisible({ timeout: ESPERA });
    await salvar.click();
    await expect(paginaAdmin.getByText(/organização atualizada/i).first()).toBeVisible({ timeout: 30_000 });

    const linha = await novaLinhaDeOrgUpdated(jaExistiam);
    expect(semCampo(linha), `metadata: ${JSON.stringify(linha.metadata)}`).toBe(true);
    medicoes.adminDentroServerAction = linha.metadata;
  });

  test("o PATCH do expediente descarta o cache: a MUDANÇA vale na mutação seguinte, sem esperar os 30 s", async ({ page }) => {
    // dentro -> fora -> dentro, cada mudança pela API do produto, a mutação do manager logo depois.
    await login(page, creds.users.manager!.email);
    const resultados: boolean[] = [];
    for (const config of [expedienteFora(), expedienteDentro(), expedienteFora()]) {
      await definirExpediente(config);
      const { requestId } = await mudarDisponibilidade(page, creds.users.manager!.id);
      resultados.push(marcada(await linhaPorRequestId(requestId, "attendant.availability_changed")));
    }
    expect(resultados, "fora, dentro, fora — cada mudança já vale na mutação seguinte").toEqual([true, false, true]);
    medicoes.cacheDescartadoPeloPatch = resultados;
  });
});
