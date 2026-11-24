/**
 * O EXPEDIENTE NA TELA DO ATENDENTE — provado pelo browser (PRD-01 / #67, T7).
 *
 * `expediente-barra-a-acao.spec.ts` prova o SERVIDOR (403). Este prova o que a PESSOA vê: a faixa no
 * shell, a página "fora de expediente", o campo de resposta travado com o motivo e os botões de ação
 * desabilitados — e que o `manager` e quem está dentro do horário NÃO veem nada disso.
 *
 * ## O que ele NÃO prova
 * A tela de CONFIGURAÇÃO do expediente (T6) e o contador de barrados: ainda não existem. O expediente
 * é gravado por service role, como o `expediente-barra-a-acao.spec.ts` faz.
 *
 * ## Relógio
 * Fuso UTC e janelas em torno do relógio do teste: "fora" = uma janela só num dia daqui a 3 dias
 * (imune a uma virada de meia-noite no meio do teste); "dentro" = `agora ± 3 h` em todos os dias, com
 * virada de dia.
 *
 * Evidência (screenshots + medições) em `.superpowers/evidence/expediente-na-tela/`.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
const EVIDENCIA = path.join(process.cwd(), ".superpowers/evidence/expediente-na-tela");

interface Creds {
  password: string;
  org_id: string;
  users: Record<string, { id: string; email: string; role: string }>;
}

let creds: Creds;
let admin: SupabaseClient;
let settingsOriginal: Record<string, unknown> = {};
let conversationId = "";
const medicoes: Record<string, unknown> = {};

const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;

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

async function captura(page: Page, nome: string): Promise<void> {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCIA, `${nome}.png`) });
}

/** Uma conversa ABERTA e SEM DONO: é a que o atendente enxerga e pode assumir. */
async function criarConversa(): Promise<string> {
  const { data: sessao } = await admin.from("channel_sessions").select("id").eq("organization_id", creds.org_id).limit(1).maybeSingle();
  if (!sessao) throw new Error("nenhum channel_session na organização");
  const { data: contato, error: eC } = await admin
    .from("contacts")
    .insert({ organization_id: creds.org_id, display_name: `Expediente E2E ${Date.now().toString(36)}` } as never)
    .select("id")
    .single();
  if (eC || !contato) throw new Error(`contato: ${eC?.message}`);
  const { data: conv, error: eV } = await admin
    .from("conversations")
    .insert({
      organization_id: creds.org_id,
      contact_id: (contato as { id: string }).id,
      channel_session_id: (sessao as { id: string }).id,
      status: "open",
      last_message_at: new Date().toISOString(),
      last_inbound_at: new Date().toISOString(),
      last_message_preview: "olá, preciso de ajuda",
    } as never)
    .select("id")
    .single();
  if (eV || !conv) throw new Error(`conversa: ${eV?.message}`);
  return (conv as { id: string }).id;
}

test.describe("expediente na tela do atendente", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test.beforeAll(async () => {
    if (!fs.existsSync(CREDS_PATH)) throw new Error("Falta .e2e-creds.json — rode `pnpm exec tsx scripts/seed-e2e-credentials.ts`.");
    creds = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
    const c = credenciaisSupabaseDeTeste();
    admin = createClient(c.url, c.serviceRole, { auth: { persistSession: false } });
    const { data, error } = await admin.from("organizations").select("settings").eq("id", creds.org_id).single();
    if (error) throw new Error(`ler settings: ${error.message}`);
    settingsOriginal = ((data as { settings: Record<string, unknown> | null }).settings ?? {}) as Record<string, unknown>;
    conversationId = await criarConversa();
  });

  test.afterAll(async () => {
    await admin.from("organizations").update({ settings: settingsOriginal } as never).eq("id", creds.org_id);
    fs.mkdirSync(EVIDENCIA, { recursive: true });
    fs.writeFileSync(path.join(EVIDENCIA, "medicoes.json"), JSON.stringify(medicoes, null, 2));
  });

  test("agent FORA do expediente: a faixa aparece em toda tela, com a janela e o motivo, e a leitura continua", async ({ page }) => {
    await gravarExpediente(expedienteFora());
    await login(page, creds.users.agent!.email);
    await page.goto("/app/inbox?filter=all");

    const faixa = page.getByTestId("faixa-de-expediente");
    await expect(faixa).toBeVisible({ timeout: 20_000 });
    await expect(faixa).toContainText(/fora do expediente/i);
    await expect(faixa).toContainText("08:00–18:00");
    await expect(faixa).toContainText(/pode consultar as conversas/i);
    await expect(faixa.getByRole("link", { name: /saiba mais/i })).toHaveAttribute("href", "/app/fora-de-expediente");

    // Medido por ferramenta, nunca a olho: a faixa tem altura, cabe na largura e não estoura a página.
    const m = await faixa.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { largura: Math.round(r.width), altura: Math.round(r.height), estouraLargura: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    medicoes.faixa = m;
    expect(m.altura, "a faixa ocupa espaço (não é um elemento vazio)").toBeGreaterThan(20);
    expect(m.estouraLargura, "a faixa não pode estourar a página na horizontal").toBe(false);
    await captura(page, "01-faixa-no-inbox");

    // A faixa vale em OUTRA tela do app (está no shell, não na tela de conversas).
    await page.goto("/app/contacts");
    await expect(page.getByTestId("faixa-de-expediente")).toBeVisible({ timeout: 20_000 });
  });

  test("agent FORA do expediente: o campo de resposta é trocado pelo motivo e as ações ficam desabilitadas", async ({ page }) => {
    await gravarExpediente(expedienteFora());
    await login(page, creds.users.agent!.email);
    await page.goto(`/app/inbox?id=${conversationId}&filter=all`);

    // LEITURA: o cabeçalho da conversa abre (o atendente precisa ler o que entrou de madrugada).
    const assumir = page.getByRole("button", { name: /^assumir$/i });
    await expect(assumir).toBeVisible({ timeout: 30_000 });
    await expect(assumir).toBeDisabled();
    await expect(assumir).toHaveAttribute("title", /fora do expediente/i);
    await expect(page.getByRole("button", { name: /^transferir$/i })).toBeDisabled();
    await expect(page.getByRole("button", { name: /^fechar$/i })).toBeDisabled();
    await expect(page.getByRole("button", { name: /lembrar/i })).toBeDisabled();

    // ESCRITA: o campo de resposta sai, e o motivo entra no lugar.
    const aviso = page.getByTestId("composer-barrado-por-expediente");
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText(/responder ou anotar/i);
    await expect(page.getByLabel(/mensagem/i)).toHaveCount(0);

    medicoes.composer = await aviso.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { largura: Math.round(r.width), altura: Math.round(r.height) };
    });
    await captura(page, "02-conversa-com-acoes-travadas");
  });

  test("[P1] agent FORA do expediente abre uma conversa com não lidas: lê, o mark-read NÃO leva 403 e o Composer segue travado", async ({ page }) => {
    // O inbox dispara `POST …/mark-read` sozinho, 1,5 s depois de abrir a conversa, e só quando há
    // não lidas. É uma escrita: sem a isenção declarada na rota, o gate fail-closed a barraria e o
    // atendente que só lê levaria 403 a cada conversa aberta (e o contador nunca zeraria).
    const { error } = await admin
      .from("conversations")
      .update({ unread_count_for_assignee: 1 } as never)
      .eq("id", conversationId);
    if (error) throw new Error(`semear não lida: ${error.message}`);

    await gravarExpediente(expedienteFora());
    await login(page, creds.users.agent!.email);

    const respostas: { status: number; codigo: string | null }[] = [];
    page.on("response", async (r) => {
      if (r.request().method() !== "POST" || !r.url().includes(`/api/v1/conversations/${conversationId}/mark-read`)) return;
      let codigo: string | null = null;
      try {
        codigo = ((await r.json()) as { error?: { code?: string } }).error?.code ?? null;
      } catch {
        /* corpo vazio ou não-JSON: o status é o que importa */
      }
      respostas.push({ status: r.status(), codigo });
    });

    const markRead = page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().includes(`/api/v1/conversations/${conversationId}/mark-read`),
      { timeout: 30_000 },
    );
    await page.goto(`/app/inbox?id=${conversationId}&filter=all`);
    const resposta = await markRead;

    // O servidor aceitou: nem 403, nem OUT_OF_WORK_HOURS.
    expect(resposta.status(), "mark-read é isento do gate de expediente").toBe(200);
    expect(respostas.map((x) => x.codigo)).not.toContain("OUT_OF_WORK_HOURS");

    // E o efeito é real: o contador zerou no banco.
    await expect
      .poll(async () => {
        const { data } = await admin.from("conversations").select("unread_count_for_assignee").eq("id", conversationId).single();
        return (data as { unread_count_for_assignee: number } | null)?.unread_count_for_assignee;
      }, { timeout: 15_000 })
      .toBe(0);

    // Enquanto isso o resto continua travado: a leitura abriu, a escrita ao cliente não.
    await expect(page.getByTestId("composer-barrado-por-expediente")).toBeVisible();
    await expect(page.getByLabel(/mensagem/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^assumir$/i })).toBeDisabled();
    await captura(page, "07-agent-fora-do-horario-le-sem-403");
  });

  test("a página 'fora de expediente' é informativa, mostra a janela e a abertura, e leva de volta às conversas", async ({ page }) => {
    await gravarExpediente(expedienteFora());
    await login(page, creds.users.agent!.email);
    await page.goto("/app/fora-de-expediente");

    const pagina = page.getByTestId("pagina-fora-de-expediente");
    await expect(pagina).toHaveAttribute("data-estado", "fora", { timeout: 20_000 });
    await expect(pagina.getByRole("heading", { level: 1 })).toHaveText(/fora do expediente/i);
    await expect(page.getByTestId("janelas-do-expediente")).toContainText("08:00–18:00");
    await expect(page.getByTestId("abertura-do-expediente")).toBeVisible();
    await captura(page, "03-pagina-fora-de-expediente");

    // Nunca é barrada nem redireciona: o link leva às conversas, que o atendente continua lendo.
    await pagina.getByRole("link", { name: /consultar as conversas/i }).click();
    await page.waitForURL(/\/app\/inbox/);
  });

  test("manager FORA do expediente NÃO vê faixa nem tem nada travado (nunca é barrado)", async ({ page }) => {
    await gravarExpediente(expedienteFora());
    await login(page, creds.users.manager!.email);
    await page.goto(`/app/inbox?id=${conversationId}&filter=all`);
    await expect(page.getByLabel(/mensagem/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("faixa-de-expediente")).toHaveCount(0);
    await expect(page.getByTestId("composer-barrado-por-expediente")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^transferir$/i })).toBeEnabled();
    await captura(page, "04-manager-fora-do-horario-sem-trava");
  });

  test("viewer (o piso) com o app aberto: a faixa lê o expediente sem 403 e sem gravar authz.denied", async ({ page }) => {
    // Regressão medida na CI: a faixa do shell chama `GET /settings/expediente` para TODO usuário
    // logado, e a rota exigia `agent`. O `viewer` (e o suporte somente-leitura) levava 403 a cada
    // carga, e cada 403 por papel grava uma linha `authz.denied` em `api_audit_log`.
    const viewer = creds.users.viewer!;
    const contarNegados = async (): Promise<number> => {
      const { count } = await admin
        .from("api_audit_log")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", creds.org_id)
        .eq("action", "authz.denied")
        .eq("resource_type", "settings_expediente")
        .eq("actor_user_id", viewer.id);
      return count ?? 0;
    };
    await gravarExpediente(expedienteFora());
    const antes = await contarNegados();

    const status: number[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/api/v1/settings/expediente") && r.request().method() === "GET") status.push(r.status());
    });
    await login(page, viewer.email);
    await page.goto("/app/inbox?filter=all");
    await expect.poll(() => status.length, { timeout: 20_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(4_000); // o suficiente para as repetições do React Query, se houvesse 403

    expect(status, "a leitura do expediente não pode ser negada ao piso").toEqual(status.map(() => 200));
    expect(await contarNegados(), "nenhum authz.denied novo por ler o expediente").toBe(antes);
    // Quem nunca é barrado não vê faixa: o `viewer` lê, não age.
    await expect(page.getByTestId("faixa-de-expediente")).toHaveCount(0);
  });

  test("agent DENTRO do expediente (janela que vira o dia): nenhuma faixa, campo de resposta de sempre", async ({ page }) => {
    await gravarExpediente(expedienteDentro());
    await login(page, creds.users.agent!.email);
    await page.goto(`/app/inbox?id=${conversationId}&filter=all`);
    await expect(page.getByLabel(/mensagem/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("faixa-de-expediente")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^transferir$/i })).toBeEnabled();

    await page.goto("/app/fora-de-expediente");
    await expect(page.getByTestId("pagina-fora-de-expediente")).toHaveAttribute("data-estado", "dentro", { timeout: 20_000 });
    await captura(page, "05-agent-dentro-do-horario");
  });

  test("[P0] instalação SEM expediente (o estado de toda instalação que atualiza): nada muda na tela", async ({ page }) => {
    await gravarExpediente(undefined);
    await login(page, creds.users.agent!.email);
    await page.goto(`/app/inbox?id=${conversationId}&filter=all`);
    await expect(page.getByLabel(/mensagem/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("faixa-de-expediente")).toHaveCount(0);

    await page.goto("/app/fora-de-expediente");
    const pagina = page.getByTestId("pagina-fora-de-expediente");
    await expect(pagina).toHaveAttribute("data-estado", "dentro", { timeout: 20_000 });
    await expect(pagina).toContainText(/não definiu um expediente/i);
    await captura(page, "06-sem-expediente-configurado");
  });
});
