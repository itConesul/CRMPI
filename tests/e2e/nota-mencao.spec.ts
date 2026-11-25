import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";

/**
 * #69 / T6 — Autocomplete de `@` nas notas internas, pela tela, com atendentes de verdade.
 *
 * Quatro `agent` da MESMA organização, cada um no seu contexto de navegador:
 *
 *   Ana Silva     escreve a nota (a autora)
 *   Beto          recebe a menção
 *   Beto Santos   NÃO recebe: "@Beto" o atingiria pelo primeiro nome, e é isso que o token escolhido evita
 *   João D'Ávila  recebe: o apóstrofo corta "@João D'Ávila" no parser, então só o `@<user_id>` o alcança
 *
 * ── O que é de verdade e o que é substituído ──────────────────────────────────────────────────
 * De verdade: login pela tela, o Composer, `GET team/assignable`, `POST …/notes`, o parser do
 * servidor, o `emit_event`, o Realtime e o `useCrmAlerts` de cada atendente.
 *
 * Substituída: só a classe `Notification` do navegador (a bandeja do sistema operacional, que o
 * Playwright não alcança). O `onclick` que o produto registra nela é o real — `window.location.assign`
 * do `emitNotification` — e é ele que este spec dispara. O toast (sonner) é o in-app, de verdade.
 *
 * Precondição: Supabase local de pé e `.env.e2e` (veja `tests/e2e/README.md`). A organização, os
 * usuários e a conversa nascem aqui e são apagados no fim.
 */

const credentials = credenciaisSupabaseDeTeste();
const db = createClient(credentials.url, credentials.serviceRole, { auth: { persistSession: false } });
const password = `Local-${randomUUID()}!`;
const EVIDENCIA = ".superpowers/evidence/nota-mencao";

type Papel = "ana" | "beto" | "betoSantos" | "joao";
const NOMES: Record<Papel, string> = {
  ana: "Ana Silva",
  beto: "Beto",
  betoSantos: "Beto Santos",
  joao: "João D'Ávila",
};
const users = {} as Record<Papel, { id: string; email: string }>;
let orgId = "";
let conversationId = "";

type Aviso = { title: string; options?: { body?: string; data?: { href?: string } }; onclick: (() => void) | null };
type JanelaComAvisos = Window & { __avisos: Aviso[] };

async function inserir(table: string, value: Record<string, unknown>): Promise<string> {
  const { data, error } = await db.from(table).insert(value).select("id").single();
  if (error) throw error;
  return data.id as string;
}

test.beforeAll(async () => {
  orgId = await inserir("organizations", {
    slug: `mencao-${randomUUID()}`,
    legal_name: "Menção Ltda",
    display_name: "Menção",
    onboarded_at: new Date().toISOString(),
    settings: { visibility_mode: "own_and_unassigned" },
  });
  for (const papel of Object.keys(NOMES) as Papel[]) {
    const email = `mencao-${papel}-${randomUUID()}@invariant.test`;
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: NOMES[papel] },
    });
    if (error || !data.user) throw error;
    users[papel] = { id: data.user.id, email };
    await inserir("user_organizations", {
      organization_id: orgId,
      user_id: data.user.id,
      role: "agent",
      accepted_at: new Date().toISOString(),
    });
  }
  const canal = await inserir("channel_sessions", {
    organization_id: orgId,
    waha_session_name: `mencao-${randomUUID()}`,
    display_name: "Canal menção",
    status: "STOPPED",
    webhook_secret_encrypted: "\\x00",
  });
  const contato = await inserir("contacts", {
    organization_id: orgId,
    display_name: "Cliente da Menção",
    phone_number: "+5511999990069",
  });
  // Sem dono: com `own_and_unassigned` todos os atendentes a enxergam, e o aviso precisa abri-la.
  conversationId = await inserir("conversations", {
    organization_id: orgId,
    contact_id: contato,
    channel_session_id: canal,
    status: "open",
    assigned_to_user_id: null,
  });
  await inserir("messages", {
    organization_id: orgId,
    conversation_id: conversationId,
    channel_session_id: canal,
    contact_id: contato,
    direction: "inbound",
    type: "text",
    body: "Preciso falar com o responsável",
    status: "received",
    sent_at: new Date().toISOString(),
  });
});

test.afterAll(async () => {
  if (orgId) {
    const r = await db.from("organizations").delete().eq("id", orgId);
    if (r.error) throw r.error;
  }
  for (const u of Object.values(users)) {
    const r = await db.auth.admin.deleteUser(u.id);
    if (r.error) throw r.error;
  }
});

/** Contexto próprio por atendente, com a `Notification` do SO substituída por um registro. */
async function atendente(browser: Browser, papel: Papel): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001" });
  await ctx.addInitScript(() => {
    const avisos: Aviso[] = [];
    class NotificacaoDeMentira {
      static permission = "granted";
      static requestPermission = async () => "granted";
      onclick: (() => void) | null = null;
      constructor(
        public title: string,
        public options?: Aviso["options"],
      ) {
        avisos.push(this as unknown as Aviso);
      }
      close() {}
    }
    Object.defineProperty(window, "Notification", { value: NotificacaoDeMentira, configurable: true, writable: true });
    (window as unknown as JanelaComAvisos).__avisos = avisos;
  });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/login");
  await page.getByLabel(/e-?mail/i).fill(users[papel].email);
  await page.getByLabel(/senha/i).fill(password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app(?:\/|$)/, { timeout: 60_000 });
  return { ctx, page };
}

const avisosDe = (page: Page) => page.evaluate(() => (window as unknown as JanelaComAvisos).__avisos.map((a) => a.title));

async function abrirNota(page: Page) {
  await page.goto(`/app/inbox?id=${conversationId}`);
  await page.getByRole("button", { name: "Nota interna" }).click();
  const campo = page.getByPlaceholder(/nota interna/i);
  await expect(campo).toBeVisible();
  return campo;
}

/**
 * A Ana escreve a nota escolhendo Beto (por clique) e João (por teclado) na lista de `@`, e a salva.
 * Prova, pelo caminho, o que só a tela mostra: a lista, o token inserido, o Enter que seleciona sem
 * salvar, e que salvar não toca o caminho de envio de mensagem.
 */
async function anaEscreveAMencao(browser: Browser) {
  mkdirSync(EVIDENCIA, { recursive: true });
  const ana = await atendente(browser, "ana");
  const requisicoes: string[] = [];
  ana.page.on("request", (req) => {
    if (req.method() === "POST") requisicoes.push(new URL(req.url()).pathname);
  });
  const campo = await abrirNota(ana.page);

  // 1) "@be" lista os dois Betos, e a autora não aparece.
  await campo.pressSequentially("Oi @be", { delay: 30 });
  const lista = ana.page.getByRole("listbox", { name: "Mencionar membro" });
  await expect(lista).toBeVisible();
  await expect(lista.getByRole("option")).toHaveText(["Beto", "Beto Santos"]);
  await ana.page.screenshot({ path: `${EVIDENCIA}/1-lista-aberta.png` });

  // 2) Escolher "Beto" por clique. O nome sozinho ("@Beto") atingiria também o Beto Santos, por primeiro
  //    nome; por isso o token que entra é o id de quem foi escolhido.
  await lista.getByRole("option", { name: "Beto", exact: true }).click();
  await expect(campo).toHaveValue(`Oi @${users.beto.id} `);
  await expect(lista).toHaveCount(0);

  // 3) "João D'Ávila" por teclado: o apóstrofo cortaria o nome no parser, então o token também é o id.
  await campo.pressSequentially("e @jo", { delay: 30 });
  await expect(lista.getByRole("option")).toHaveText(["João D'Ávila"]);
  await campo.press("Enter");
  await expect(campo).toHaveValue(`Oi @${users.beto.id} e @${users.joao.id} `);
  // Enter com a lista aberta SELECIONA; não pode ter salvo a nota.
  expect(requisicoes.filter((p) => p.endsWith("/notes"))).toHaveLength(0);
  await ana.page.screenshot({ path: `${EVIDENCIA}/2-tokens-inseridos.png` });

  // 4) Salvar a nota. Nada vai ao cliente: nenhuma chamada ao caminho de envio de mensagem (CA-1).
  await campo.pressSequentially("podem assumir o caso?", { delay: 20 });
  const salvou = ana.page.waitForResponse(
    (r) => r.url().includes(`/conversations/${conversationId}/notes`) && r.request().method() === "POST",
  );
  await campo.press("Enter");
  expect((await salvou).status()).toBe(201);
  expect(requisicoes.filter((p) => p.endsWith("/notes"))).toHaveLength(1);
  expect(requisicoes.filter((p) => /\/api\/v1\/messages$/.test(p))).toHaveLength(0);
  return { ana, requisicoes };
}

test("A escolhe pessoas na lista de @: o servidor avisa só quem foi escolhido, e nada vai ao cliente", async ({ browser }) => {
  test.setTimeout(120_000);
  const desde = new Date().toISOString();
  const { ana } = await anaEscreveAMencao(browser);

  // No servidor: exatamente dois `user.mentioned`, para o Beto e para o João — e NÃO para o Beto Santos,
  // que "@Beto" teria atingido por primeiro nome. É o RF-4 de ponta a ponta.
  await expect
    .poll(
      async () => {
        const { data, error } = await db
          .from("event_log")
          .select("payload")
          .eq("organization_id", orgId)
          .eq("event_type", "user.mentioned")
          .gte("created_at", desde);
        if (error) throw error;
        return (data ?? []).map((e) => (e.payload as { to_user_id: string }).to_user_id).sort();
      },
      { timeout: 15_000 },
    )
    .toEqual([users.beto.id, users.joao.id].sort());

  await ana.ctx.close();
});

/**
 * BLOQUEADO — dívida conhecida, issue #137. Enquanto ela existir, o CA-2 e o RF-6 da spec #69 NÃO estão
 * atendidos. A tabela já constava em `DIVIDA_CONHECIDA` de `tests/unit/realtime-assinatura-tem-publicacao.test.ts`;
 * este spec só a expôs, ao exigir o CA-2.
 *
 * O aviso in-app de menção (`useCrmAlerts.onNote`) e a nota aparecendo ao vivo (`useConversationNotes`)
 * assinam `postgres_changes` em `conversation_notes`, e essa tabela NÃO está na publicação
 * `supabase_realtime`: nem no `baseline.sql` (que publica messages, conversations, crm_leads, ai_agents,
 * ai_agent_runs, ai_knowledge_sources e crm_lead_activities) nem em nenhuma migration. Medido no banco
 * local montado só com o baseline: `select tablename from pg_publication_tables where
 * pubname='supabase_realtime'` não lista `conversation_notes`.
 *
 * Consequência: o CA-2 da spec #69 ("o mencionado recebe o aviso em tempo real, e o clique abre a
 * conversa") não vale hoje em nenhuma instalação. Consertar é mudança de schema (migration + apêndice do
 * baseline + MANIFEST), e a spec proíbe isso nesta issue (`02-design.md` §4, RNF/CA-8).
 *
 * A #137 detalha o conserto (opção B): apertar a política de leitura, separar a política `FOR ALL` (que
 * inclui SELECT) e só então publicar. Publicar sozinho faria o corpo das notas chegar por Realtime a quem
 * não vê a conversa. Medido num experimento local em 2026-11-25: publicar a tabela faz este teste passar, e
 * tirá-la da publicação o faz falhar de novo.
 *
 * Quando a #137 for resolvida, trocar `test.fixme` por `test` — o corpo já está pronto.
 */
test.fixme("o mencionado recebe o aviso em tempo real e o clique abre a conversa (CA-2)", async ({ browser }, info) => {
  test.setTimeout(240_000);

  // Quem vai ser avisado já está logado numa tela do app ANTES de a nota existir, como na vida real.
  const beto = await atendente(browser, "beto");
  const betoSantos = await atendente(browser, "betoSantos");
  const joao = await atendente(browser, "joao");
  for (const { page } of [beto, betoSantos, joao]) await page.goto("/app/inbox");
  // O canal Realtime de avisos assina depois do carregamento; sem esta espera a nota sairia antes dele.
  await beto.page.waitForTimeout(4_000);

  const { ana } = await anaEscreveAMencao(browser);

  // 5) O Beto recebe o aviso SEM recarregar a página. É o toast in-app e a notificação do navegador.
  await expect(beto.page.getByText("Você foi mencionado").first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => avisosDe(beto.page), { timeout: 15_000 }).toContain("Você foi mencionado");
  await beto.page.screenshot({ path: `${EVIDENCIA}/3-aviso-do-beto.png` });

  // 6) O João também (token por id, alcançado apesar do apóstrofo).
  await expect(joao.page.getByText("Você foi mencionado").first()).toBeVisible({ timeout: 30_000 });

  // 7) O Beto Santos NÃO: o toast do Beto já chegou, então se ele fosse avisado o aviso já estaria lá.
  await expect(betoSantos.page.getByText("Você foi mencionado")).toHaveCount(0);
  expect(await avisosDe(betoSantos.page)).toEqual([]);

  // 8) Clicar no aviso do Beto (o `onclick` real do produto) abre a conversa citada.
  const href = await beto.page.evaluate(() => {
    const a = (window as unknown as JanelaComAvisos).__avisos.at(-1)!;
    const alvo = a.options?.data?.href ?? "";
    a.onclick?.();
    return alvo;
  });
  expect(href).toContain(`/app/inbox?id=${conversationId}`);
  await beto.page.waitForURL(new RegExp(`/app/inbox\\?id=${conversationId}`), { timeout: 30_000 });
  await expect(beto.page.getByText("podem assumir o caso?").first()).toBeVisible();
  await beto.page.screenshot({ path: `${EVIDENCIA}/4-conversa-aberta-pelo-aviso.png` });

  info.annotations.push({ type: "evidencia", description: EVIDENCIA });
  for (const { ctx } of [ana, beto, betoSantos, joao]) await ctx.close();
});

test("a lista abre só em nota, não oferece a autora, e cabe na tela (medido)", async ({ browser }) => {
  test.setTimeout(120_000);
  mkdirSync(EVIDENCIA, { recursive: true });
  const ana = await atendente(browser, "ana");
  const { page } = ana;

  // Em modo mensagem, "@" é só texto: a lista nunca abre.
  await page.goto(`/app/inbox?id=${conversationId}`);
  // `getByLabel("Mensagem")` casa 2 elementos (o campo e outro controle de rótulo parecido): o campo é a textarea.
  const mensagem = page.locator('textarea[aria-label="Mensagem"]');
  await mensagem.pressSequentially("oi @", { delay: 30 });
  await expect(page.getByRole("listbox", { name: "Mencionar membro" })).toHaveCount(0);
  await mensagem.fill("");

  // Em nota, abre, e a autora (Ana Silva) fica de fora.
  const campo = await abrirNota(page);
  await campo.pressSequentially("@", { delay: 30 });
  const lista = page.getByRole("listbox", { name: "Mencionar membro" });
  await expect(lista).toBeVisible();
  await expect(lista.getByRole("option")).toHaveText(["Beto", "Beto Santos", "João D'Ávila"]);

  // Medido no navegador: dentro da janela e acima do campo, no desktop e no celular.
  const medir = () =>
    page.evaluate(() => {
      const l = document.querySelector('[role="listbox"]')!.getBoundingClientRect();
      const c = document.querySelector("textarea")!.getBoundingClientRect();
      return {
        esquerda: l.left,
        direita: l.right,
        topo: l.top,
        fundo: l.bottom,
        topoDoCampo: c.top,
        largura: document.documentElement.clientWidth,
        rolagemLateral: document.body.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
  const desktop = await medir();
  expect(desktop.esquerda).toBeGreaterThanOrEqual(0);
  expect(desktop.direita).toBeLessThanOrEqual(desktop.largura);
  expect(desktop.topo).toBeGreaterThanOrEqual(0);
  expect(desktop.fundo).toBeLessThanOrEqual(desktop.topoDoCampo + 1);
  expect(desktop.rolagemLateral).toBe(false);
  await page.screenshot({ path: `${EVIDENCIA}/5-desktop.png` });

  // Esc fecha sem apagar o texto; Enter volta a salvar (a nota nunca fica presa).
  await campo.press("Escape");
  await expect(lista).toHaveCount(0);
  await expect(campo).toHaveValue("@");

  await page.setViewportSize({ width: 390, height: 844 });
  await campo.fill("");
  await campo.pressSequentially("@", { delay: 30 });
  await expect(lista).toBeVisible();
  const celular = await medir();
  expect(celular.esquerda).toBeGreaterThanOrEqual(0);
  expect(celular.direita).toBeLessThanOrEqual(celular.largura);
  expect(celular.fundo).toBeLessThanOrEqual(celular.topoDoCampo + 1);
  expect(celular.rolagemLateral).toBe(false);
  await page.screenshot({ path: `${EVIDENCIA}/6-celular-390.png` });

  await ana.ctx.close();
});
