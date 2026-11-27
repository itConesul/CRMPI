/**
 * EXCLUIR CONTATO — SÓ `manager` OU ACIMA, E O HISTÓRICO NÃO SE APAGA (#99, T6; CA-5, CA-6, CA-7).
 *
 * O que o usuário vê e faz, provado PELA TELA, com o banco conferido depois de cada ação:
 *
 *  1. `agent` e `viewer` abrem a lista de contatos e NÃO têm o botão "Excluir contato" (RF-6). Se a
 *     rota fosse chamada direto, o `agent` recebe 403 e o contato fica (RF-5).
 *  2. `manager` abre o diálogo: ele não promete mais apagar "a conversa associada" e manda anonimizar (RF-7).
 *  3. `manager` exclui um contato COM conversa: o toast explica e manda pedir a um administrador, e o contato,
 *     a conversa e a mensagem continuam no banco — o histórico não se apaga pela API (RF-3).
 *  4. `manager` exclui um contato SEM histórico: ele some da lista e do banco (RF-4).
 *
 * O `admin` fica de fora do e2e: o login dele pede TOTP e não completa em sonda simples. A regra para
 * `admin` é a mesma do `manager` (`podeExcluirContato`), provada em `contato-excluir-predicado.test.ts`.
 *
 * Semeia pelo cliente `service role` do supabase-js (nada de nome de container fixo) e usa nomes únicos por
 * execução: o banco de e2e é compartilhado e `contacts` tem índices únicos por organização.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";

import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");

interface Creds {
  org_id: string;
  password: string;
  users: Record<string, { email: string }>;
}

function lerCreds(): Creds {
  if (!fs.existsSync(CREDS_PATH)) {
    throw new Error("sem .e2e-creds.json: rode `pnpm tsx scripts/seed-e2e-credentials.ts` antes");
  }
  const c = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
  for (const papel of ["manager", "agent", "viewer"]) {
    if (!c.users?.[papel]) throw new Error(`.e2e-creds.json sem o usuário "${papel}"`);
  }
  return c;
}

const creds = lerCreds();
const supa = credenciaisSupabaseDeTeste();
const sb: SupabaseClient = createClient(supa.url, supa.serviceRole, { auth: { persistSession: false } });

const sufixo = `${process.pid}${Date.now().toString(36).slice(-4)}`;
const NOME_LIVRE = `Excluir Livre ${sufixo}`;
const NOME_LIVRE_2 = `Excluir Livre Dois ${sufixo}`;
const NOME_COM_CONVERSA = `Excluir Com Conversa ${sufixo}`;
const EVIDENCIA = path.join(process.cwd(), ".superpowers", "evidence");

let contatoLivre = "";
let contatoLivre2 = "";
let contatoComConversa = "";
let conversa = "";
let mensagem = "";

async function contar(tabela: string, coluna: string, valor: string): Promise<number> {
  const { count, error } = await sb.from(tabela).select("id", { count: "exact", head: true }).eq(coluna, valor);
  if (error) throw new Error(`contar ${tabela}: ${error.message}`);
  return count ?? 0;
}

test.beforeAll(async () => {
  fs.mkdirSync(EVIDENCIA, { recursive: true });

  // Uma sessão de canal da org (NOT NULL em conversas): usa a que existir; senão cria uma mínima.
  let { data: sessao } = await sb
    .from("channel_sessions")
    .select("id")
    .eq("organization_id", creds.org_id)
    .limit(1)
    .maybeSingle();
  if (!sessao) {
    const novo = await sb
      .from("channel_sessions")
      .insert({
        organization_id: creds.org_id,
        waha_session_name: `e2e-excluir-${sufixo}`,
        webhook_secret_encrypted: "\\x00",
      })
      .select("id")
      .single();
    if (novo.error) throw new Error(`sessão de canal: ${novo.error.message}`);
    sessao = novo.data;
  }
  const canal = (sessao as { id: string }).id;

  const criar = async (nome: string): Promise<string> => {
    const r = await sb
      .from("contacts")
      .insert({ organization_id: creds.org_id, display_name: nome })
      .select("id")
      .single();
    if (r.error) throw new Error(`contato "${nome}": ${r.error.message}`);
    return (r.data as { id: string }).id;
  };
  contatoLivre = await criar(NOME_LIVRE);
  contatoLivre2 = await criar(NOME_LIVRE_2);
  contatoComConversa = await criar(NOME_COM_CONVERSA);

  const c = await sb
    .from("conversations")
    .insert({
      organization_id: creds.org_id,
      contact_id: contatoComConversa,
      channel_session_id: canal,
      status: "open",
    })
    .select("id")
    .single();
  if (c.error) throw new Error(`conversa: ${c.error.message}`);
  conversa = (c.data as { id: string }).id;

  const m = await sb
    .from("messages")
    .insert({
      organization_id: creds.org_id,
      conversation_id: conversa,
      channel_session_id: canal,
      contact_id: contatoComConversa,
      type: "text",
      direction: "inbound",
      status: "received",
      body: "mensagem que não pode sumir",
    })
    .select("id")
    .single();
  if (m.error) throw new Error(`mensagem: ${m.error.message}`);
  mensagem = (m.data as { id: string }).id;
});

test.afterAll(async () => {
  // Limpa o que SOBROU. O contato com conversa nunca é apagado pelo produto: removemos como `service role`
  // (que não depende da policy), na ordem das FKs.
  if (mensagem) await sb.from("messages").delete().eq("id", mensagem);
  if (conversa) await sb.from("conversations").delete().eq("id", conversa);
  for (const id of [contatoComConversa, contatoLivre, contatoLivre2]) {
    if (id) await sb.from("contacts").delete().eq("id", id);
  }
});

async function login(page: Page, papel: "manager" | "agent" | "viewer"): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(creds.users[papel]!.email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app/, { timeout: 30_000 });
}

/**
 * Abre a lista de contatos, filtra pelo nome e espera a linha FILTRADA aparecer.
 *
 * A busca da tela tem debounce de 250 ms e, ao mudar o termo, a query volta a `isLoading` e a tabela é
 * DESMONTADA (`app/app/contacts/_client.tsx`: `isLoading ? <Skeleton/> : <ContactsTable/>`); o estado do
 * diálogo vive nela. O contato recém-criado já aparece na lista SEM filtro, então esperar só "a linha
 * visível" deixa o clique cair antes da troca: o diálogo abre e some. Por isso espera-se a RESPOSTA da
 * busca filtrada (medido numa sonda: 6/6 perdem o diálogo clicando antes; 6/6 o mantêm esperando a resposta).
 */
async function abrirLista(page: Page, nome: string): Promise<void> {
  await page.goto("/app/contacts");
  const filtrada = page.waitForResponse(
    (r) => r.url().includes("/api/v1/contacts?") && r.url().includes("search="),
  );
  await page.getByPlaceholder(/Buscar por nome, email ou telefone/i).fill(nome);
  await filtrada;
  await expect(page.getByRole("row", { name: new RegExp(nome) })).toBeVisible({ timeout: 20_000 });
}

const botaoExcluir = (page: Page, nome: string) =>
  page.getByRole("button", { name: `Excluir contato ${nome}` });

for (const papel of ["agent", "viewer"] as const) {
  test(`${papel}: vê o contato na lista, mas NÃO tem o botão Excluir contato (RF-6, CA-6)`, async ({ page }) => {
    await login(page, papel);
    await abrirLista(page, NOME_LIVRE);
    // O DOM inteiro, não só a linha: o botão não pode existir escondido por CSS.
    await expect(page.getByRole("button", { name: /Excluir contato/ })).toHaveCount(0);
    await expect(page.locator('[aria-label^="Excluir contato"]')).toHaveCount(0);
    await page.screenshot({ path: path.join(EVIDENCIA, `99-lista-contatos-${papel}-sem-botao.png`) });
  });
}

test("agent: chamar a rota DELETE direto recebe 403 e o contato continua lá (RF-5, CA-5)", async ({ page }) => {
  await login(page, "agent");
  const res = await page.request.delete(`/api/v1/contacts/${contatoLivre}`);
  expect(res.status()).toBe(403);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe("forbidden_role");
  expect(await contar("contacts", "id", contatoLivre)).toBe(1);
});

test("manager: o diálogo manda anonimizar e não promete apagar a conversa (RF-7, CA-7)", async ({ page }) => {
  await login(page, "manager");
  await abrirLista(page, NOME_COM_CONVERSA);
  await expect(botaoExcluir(page, NOME_COM_CONVERSA)).toBeVisible();
  await botaoExcluir(page, NOME_COM_CONVERSA).click();

  const dialogo = page.getByRole("alertdialog");
  await expect(dialogo).toBeVisible();
  await expect(dialogo).not.toContainText("conversa associada");
  await expect(dialogo).toContainText("administrador");
  await expect(dialogo).toContainText("anonimiz");
  await page.screenshot({ path: path.join(EVIDENCIA, "99-dialogo-excluir-contato.png") });
  await dialogo.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialogo).toBeHidden();
});

test("manager: excluir contato COM conversa dá 409 explicado e o histórico continua no banco (RF-3, CA-3)", async ({ page }) => {
  await login(page, "manager");
  await abrirLista(page, NOME_COM_CONVERSA);
  await botaoExcluir(page, NOME_COM_CONVERSA).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir", exact: true }).click();

  // O toast é o que o usuário lê. O diálogo também cita "administrador", então o filtro é pelo toast.
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: "administrador" });
  await expect(toast).toBeVisible({ timeout: 15_000 });
  await expect(toast).toContainText("anonimiz");
  await page.screenshot({ path: path.join(EVIDENCIA, "99-409-contato-com-conversa.png") });

  // O banco é a verdade: contato, conversa e mensagem seguem lá.
  expect(await contar("contacts", "id", contatoComConversa)).toBe(1);
  expect(await contar("conversations", "id", conversa)).toBe(1);
  expect(await contar("messages", "id", mensagem)).toBe(1);
});

test("manager: excluir contato SEM histórico remove da lista e do banco (RF-4, CA-4)", async ({ page }) => {
  await login(page, "manager");
  await abrirLista(page, NOME_LIVRE_2);
  await botaoExcluir(page, NOME_LIVRE_2).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir", exact: true }).click();

  await expect(page.locator("[data-sonner-toast]").filter({ hasText: /Contato excluído/ })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("row", { name: new RegExp(NOME_LIVRE_2) })).toHaveCount(0);
  await page.screenshot({ path: path.join(EVIDENCIA, "99-contato-sem-historico-excluido.png") });

  expect(await contar("contacts", "id", contatoLivre2)).toBe(0);
});
