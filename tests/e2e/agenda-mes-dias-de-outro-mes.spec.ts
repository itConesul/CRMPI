import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";

import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";

/**
 * VISÃO MÊS: OS DIAS ESMAECIDOS DE OUTRO MÊS MOSTRAM O QUE EXISTE NELES (#94).
 *
 * ─── O defeito ───────────────────────────────────────────────────────────────
 *
 * A grade do Mês DESENHA 42 dias (6 semanas), inclusive os do mês anterior e do
 * seguinte, mas BUSCAVA só o mês corrente. As células esmaecidas apareciam
 * vazias, em silêncio, mesmo com compromisso ou ocupação do Google nelas.
 *
 * ─── Por que esta spec não depende do dia em que roda ────────────────────────
 *
 * `agenda-ocupacao-do-google-na-grade` derrubou o CI numa virada de mês porque
 * usa "hoje + 7 dias": só cai numa célula esmaecida em certos dias do
 * calendário. Aqui a célula é ESCOLHIDA PELA TELA:
 *
 *  - o último dia desenhado (índice 41 de 42) é SEMPRE do mês seguinte: um mês
 *    tem no máximo 31 dias e a grade começa no máximo 6 dias antes do dia 1, então
 *    o mês corrente termina no índice 36, no máximo;
 *  - o primeiro (índice 0) é do mês anterior sempre que o mês não começa num
 *    domingo. Se o mês de hoje começa num domingo, a spec avança mês a mês (até
 *    12) até achar um que tenha célula do mês anterior, e FALHA com mensagem
 *    clara se nenhum tiver.
 *
 * O índice 15 é sempre do mês corrente (os índices 6 a 36 o são): é a régua.
 *
 * Os helpers abaixo repetem os de `agenda-ocupacao-do-google-na-grade` de
 * propósito: aquela spec é a REGRESSÃO deste defeito e fica sem alteração.
 */

const RAIZ = path.resolve(__dirname, "../..");
const TITULO_SIGILOSO = "Consulta particular CÉLULA ESMAECIDA";
const EMAIL_DA_CONTA = "agenda-pessoal-qa@gmail.com";
const ID_PROXIMO = "qa-mes-outro-mes-seguinte";
const ID_ANTERIOR = "qa-mes-outro-mes-anterior";
const MAXIMO_DE_MESES = 12;

interface Creds {
  password: string;
  org_id: string;
  users: Record<string, { id: string; email: string } | undefined>;
  agenda?: { tipo_id: string; tipo_nome: string; contato_id: string };
}

function lerCreds(): Creds {
  const p = path.join(RAIZ, ".e2e-creds.json");
  if (!fs.existsSync(p))
    throw new Error("`.e2e-creds.json` ausente — rode `scripts/seed-e2e-credentials.ts`");
  let c = JSON.parse(fs.readFileSync(p, "utf8")) as Creds;
  if (!c.agenda) {
    execFileSync("npx", ["tsx", "scripts/seed-e2e-agenda.ts"], { stdio: "inherit", cwd: RAIZ });
    c = JSON.parse(fs.readFileSync(p, "utf8")) as Creds;
  }
  if (!c.agenda) throw new Error("seed-e2e-agenda não gravou o bloco `agenda`");
  return c;
}

function admin() {
  const c = credenciaisSupabaseDeTeste();
  return createClient(c.url, c.serviceRole, { auth: { persistSession: false } });
}

async function entrar(page: Page, creds: Creds) {
  const usuario = creds.users.manager;
  if (!usuario) throw new Error(".e2e-creds.json sem o usuário `manager`");
  await page.goto("/login");
  await page.getByLabel(/e-?mail/i).fill(usuario.email);
  await page.getByLabel(/senha/i).fill(creds.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app(\/|$)/, { timeout: 20_000 });
  await page.goto("/app/agenda");
  await expect(page.getByTestId("tela-agenda")).toBeVisible({ timeout: 25_000 });
}

async function conexaoDoGoogle(orgId: string, userId: string): Promise<string> {
  const db = admin();
  const { data: existente } = await db
    .from("calendar_connections")
    .select("id")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .eq("account_email", EMAIL_DA_CONTA)
    .maybeSingle();
  if (existente) return (existente as { id: string }).id;
  const { data, error } = await db
    .from("calendar_connections")
    .insert({
      organization_id: orgId,
      user_id: userId,
      provider: "google_calendar",
      account_email: EMAIL_DA_CONTA,
      status: "healthy",
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(`calendar_connections: ${error.message}`);
  return (data as { id: string }).id;
}

/** O instante ISO de `dia` às `hora`, calculado NO BROWSER (a grade usa o fuso dele). */
async function instanteNoDia(page: Page, dia: string, hora: number): Promise<string> {
  return page.evaluate(
    ([d, h]) => {
      const [ano, mes, diaDoMes] = (d as string).split("-").map(Number);
      return new Date(ano!, mes! - 1, diaDoMes!, h as number, 0, 0, 0).toISOString();
    },
    [dia, hora] as [string, number],
  );
}

/** Os 42 `yyyy-MM-dd` que a grade do Mês desenha, na ordem. */
async function diasDaGrade(page: Page): Promise<string[]> {
  const ids = await page
    .locator('[data-testid^="celula-mes-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid") ?? ""));
  return ids.map((id) => id.replace("celula-mes-", ""));
}

async function abrirVisaoMes(page: Page) {
  await page.getByTestId("visao-mes").click();
  await expect(page.locator('[data-testid^="celula-mes-"]')).toHaveCount(42, { timeout: 20_000 });
}

/** Avança um período e espera a grade trocar de mês (a régua é o índice 15). */
async function avancarUmPeriodo(page: Page) {
  const antes = (await diasDaGrade(page))[15]!.slice(0, 7);
  await page.getByTestId("periodo-seguinte").click();
  await expect
    .poll(async () => (await diasDaGrade(page))[15]!.slice(0, 7), {
      message: "a grade do Mês não avançou depois do clique em «Próximo período»",
      timeout: 15_000,
    })
    .not.toBe(antes);
}

test.describe("visão Mês — dias de outro mês", () => {
  test("a célula esmaecida do mês seguinte e a do anterior mostram a ocupação do Google", async ({
    page,
  }) => {
    const creds = lerCreds();
    const dono = creds.users.agent!;
    const db = admin();
    await entrar(page, creds);

    // Limpa restos de uma execução anterior ANTES de medir qualquer coisa.
    for (const id of [ID_PROXIMO, ID_ANTERIOR]) {
      await db
        .from("calendar_external_events")
        .delete()
        .eq("organization_id", creds.org_id)
        .eq("external_event_id", id);
    }

    try {
      // ── 1ª passada: ESCOLHER as células pela tela ──────────────────────────
      await abrirVisaoMes(page);
      const inicial = await diasDaGrade(page);
      const diaDoMesSeguinte = inicial[41]!;
      expect(
        diaDoMesSeguinte.slice(0, 7),
        "o último dia desenhado deveria ser do mês seguinte ao da régua (índice 15)",
      ).not.toBe(inicial[15]!.slice(0, 7));

      // O mês ANTERIOR só tem célula quando o mês não abre num domingo. Avança
      // até achar um mês que tenha, sem nunca depender do dia de hoje.
      let periodosAteOAnterior = 0;
      let diaDoMesAnterior: string | null = null;
      for (let i = 0; i <= MAXIMO_DE_MESES; i++) {
        const dias = await diasDaGrade(page);
        if (dias[0]!.slice(0, 7) !== dias[15]!.slice(0, 7)) {
          diaDoMesAnterior = dias[0]!;
          periodosAteOAnterior = i;
          break;
        }
        if (i === MAXIMO_DE_MESES) break;
        await avancarUmPeriodo(page);
      }
      if (!diaDoMesAnterior) {
        throw new Error(
          `nenhum dos ${MAXIMO_DE_MESES} meses seguintes tem célula esmaecida do mês ANTERIOR ` +
            "na primeira linha da grade — a prova do mês anterior (CA-4) não pôde ser feita.",
        );
      }

      // ── Semeia uma ocupação do Google em cada célula escolhida ─────────────
      const conexaoId = await conexaoDoGoogle(creds.org_id, dono.id);
      const semear = async (externalId: string, dia: string): Promise<string> => {
        const { data, error } = await db
          .from("calendar_external_events")
          .insert({
            organization_id: creds.org_id,
            connection_id: conexaoId,
            external_calendar_id: "primary",
            external_event_id: externalId,
            title: TITULO_SIGILOSO,
            starts_at: await instanteNoDia(page, dia, 15),
            ends_at: await instanteNoDia(page, dia, 16),
            status: "confirmed",
            transparency: "opaque",
          } as never)
          .select("id")
          .single();
        if (error) throw new Error(`calendar_external_events: ${error.message}`);
        return (data as { id: string }).id;
      };
      const idProximo = await semear(ID_PROXIMO, diaDoMesSeguinte);
      const idAnterior = await semear(ID_ANTERIOR, diaDoMesAnterior);

      // ── 2ª passada: recarrega e confere NA TELA ────────────────────────────
      await page.reload();
      await expect(page.getByTestId("tela-agenda")).toBeVisible({ timeout: 25_000 });
      await abrirVisaoMes(page);

      // Mês seguinte: a célula esmaecida do FIM da grade (mês de hoje).
      const celulaProxima = page.getByTestId(`celula-mes-${diaDoMesSeguinte}`);
      await expect(
        celulaProxima.getByTestId(`chip-mes-${idProximo}`),
        `a célula esmaecida ${diaDoMesSeguinte} (mês SEGUINTE) está vazia: a visão Mês desenha esse ` +
          "dia mas não buscou o que existe nele (#94)",
      ).toBeVisible({ timeout: 20_000 });
      await expect(celulaProxima.getByTestId(`chip-mes-${idProximo}`)).toContainText(/ocupado/i);

      // Mês anterior: avança até o mês escolhido e confere a 1ª célula da grade.
      for (let i = 0; i < periodosAteOAnterior; i++) await avancarUmPeriodo(page);
      const celulaAnterior = page.getByTestId(`celula-mes-${diaDoMesAnterior}`);
      await expect(
        celulaAnterior.getByTestId(`chip-mes-${idAnterior}`),
        `a célula esmaecida ${diaDoMesAnterior} (mês ANTERIOR) está vazia: a visão Mês desenha esse ` +
          "dia mas não buscou o que existe nele (#94)",
      ).toBeVisible({ timeout: 20_000 });
      await expect(celulaAnterior.getByTestId(`chip-mes-${idAnterior}`)).toContainText(/ocupado/i);

      // O título do evento do Google é segredo por contrato, também aqui.
      expect(
        await page.content(),
        "o título do evento do Google VAZOU na visão Mês",
      ).not.toContain(TITULO_SIGILOSO);

      fs.mkdirSync(path.join(RAIZ, ".superpowers/evidence"), { recursive: true });
      await page.screenshot({
        path: path.join(RAIZ, ".superpowers/evidence/agenda-mes-dia-de-outro-mes.png"),
        fullPage: false,
      });
    } finally {
      for (const id of [ID_PROXIMO, ID_ANTERIOR]) {
        await db
          .from("calendar_external_events")
          .delete()
          .eq("organization_id", creds.org_id)
          .eq("external_event_id", id);
      }
    }
  });
});
