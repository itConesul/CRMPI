/**
 * O gate de expediente é FAIL-CLOSED (PRD-01 / #67): o que este arquivo vigia é a lista curta de
 * EXCEÇÕES, não uma lista longa de rotas protegidas que envelhece.
 *
 * Fora do expediente, todo método que não seja leitura é barrado ao `agent` dentro do `requireRole`.
 * Isso tem três bordas que um teste precisa fixar, senão elas mudam em silêncio:
 *
 *  1. as ISENÇÕES (`expediente: { isenta: "<motivo>" }`) — cada uma com motivo escrito, e a lista
 *     exata é conhecida: adicionar uma obriga a editar este teste, ou seja, vira decisão visível;
 *  2. as rotas de escrita que NÃO passam por `requireRole` — fora do alcance do gate, por construção.
 *     A lista é fixa: uma rota de escrita nova sem `requireRole` reprova aqui até alguém decidir;
 *  3. `cron/*` e `webhooks/*` — nunca chamam o gate (RNF-1): a ingestão de mensagem não pode ser
 *     barrada por expediente (RF-11), e o cron autentica por segredo.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ_API = join(process.cwd(), "app", "api", "v1");

function rotas(dir: string): string[] {
  const achadas: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) achadas.push(...rotas(caminho));
    else if (nome === "route.ts") achadas.push(caminho);
  }
  return achadas;
}

const rota = (arquivo: string) => relative(RAIZ_API, arquivo).split(sep).join("/").replace(/\/route\.ts$/, "");

const TODAS = rotas(RAIZ_API).map((arquivo) => ({
  rota: rota(arquivo),
  fonte: readFileSync(arquivo, "utf8"),
}));

const TEM_ESCRITA = /export\s+(async\s+)?function\s+(POST|PATCH|PUT|DELETE)\b|export\s+const\s+(POST|PATCH|PUT|DELETE)\b/;
const escrita = TODAS.filter((r) => TEM_ESCRITA.test(r.fonte));

/** As isenções conhecidas, com o motivo que cada uma declara. */
const ISENCOES_ESPERADAS: Record<string, string[]> = {
  "attendants/availability/[user_id]": ["o atendente gerencia a própria disponibilidade"],
  "notifications/push": [
    "inscrição de push do próprio navegador",
    "inscrição de push do próprio navegador",
  ],
};

/**
 * Rotas de escrita que NÃO chamam `requireRole` — fora do alcance do gate de expediente. Fixas e
 * com a categoria do porquê. Rota nova de escrita sem `requireRole` reprova até entrar aqui.
 *
 * `agenda/agendamentos/[id]/google/*`, `channels/partner/templates*`, `team/[user_id]*` e
 * `system/update` NÃO usam `requireRole` e precisam de decisão própria (T0(f) do `04-tarefas.md`):
 * se um `agent` as alcança, o fail-closed não as cobre hoje.
 */
const FORA_DO_ALCANCE_DO_GATE = new Set([
  // plataforma (autenticam por requirePlatformAdmin / segredo interno)
  "admin/incidents/[id]/resolve",
  "admin/platform-admins",
  "admin/tenants",
  "admin/tenants/[id]/impersonate",
  "admin/tenants/[id]/reactivate",
  "admin/tenants/[id]/suspend",
  "admin/impersonate/end",
  "system/agent",
  "system/update",
  // organização, com gate próprio (a revisar na T0(f) se um agent as alcança)
  "marca/logo",
  "team/[user_id]",
  "team/[user_id]/role",
  "channels/partner/templates",
  "channels/partner/templates/media",
  "agenda/agendamentos/[id]/google/meet/deliver",
  "agenda/agendamentos/[id]/google/meet/retry",
  "agenda/agendamentos/[id]/google/retry",
]);

const ehCronOuWebhook = (r: string) => r.startsWith("cron/") || r.startsWith("webhooks/");

describe("gate de expediente fail-closed — varredura de app/api/v1/**", () => {
  it("a varredura enxerga as rotas (controle positivo: não é verde vazio)", () => {
    expect(TODAS.length).toBeGreaterThan(100);
    expect(escrita.length).toBeGreaterThan(100);
  });

  it("toda isenção declarada tem MOTIVO escrito (string literal não vazia)", () => {
    const declaracoes = [...TODAS.flatMap((r) => [...r.fonte.matchAll(/expediente:\s*\{\s*isenta:\s*([^}]*)\}/g)].map((m) => ({ rota: r.rota, valor: m[1]!.trim() })))];
    expect(declaracoes.length).toBeGreaterThan(0);
    for (const d of declaracoes) {
      expect(d.valor, `${d.rota}: a isenção precisa de um motivo escrito`).toMatch(/^"[^"]{8,}"\s*$/);
    }
  });

  it("a lista de isenções é EXATAMENTE a conhecida (adicionar uma é decisão, não esquecimento)", () => {
    const achadas: Record<string, string[]> = {};
    for (const r of TODAS) {
      const motivos = [...r.fonte.matchAll(/expediente:\s*\{\s*isenta:\s*"([^"]+)"/g)].map((m) => m[1]!);
      if (motivos.length) achadas[r.rota] = motivos;
    }
    expect(achadas).toEqual(ISENCOES_ESPERADAS);
  });

  it("isenção só em rota que de fato chama requireRole (senão a declaração é decorativa)", () => {
    for (const r of TODAS.filter((x) => /expediente:\s*\{\s*isenta:/.test(x.fonte))) {
      expect(r.fonte, r.rota).toMatch(/requireRole\(/);
    }
  });

  it("RNF-1 / RF-11 · nenhuma rota de cron/* ou webhooks/* chama requireRole nem declara expediente", () => {
    const ofensoras = TODAS.filter(
      (r) => ehCronOuWebhook(r.rota) && (/requireRole\(/.test(r.fonte) || /expediente:\s*\{/.test(r.fonte)),
    ).map((r) => r.rota);
    expect(ofensoras).toEqual([]);
  });

  it("toda rota de escrita sem requireRole está na lista FIXA de fora-do-alcance (rota nova reprova aqui)", () => {
    const semGate = escrita
      .filter((r) => !ehCronOuWebhook(r.rota) && !/requireRole\(/.test(r.fonte))
      .map((r) => r.rota)
      .sort();
    const desconhecidas = semGate.filter((r) => !FORA_DO_ALCANCE_DO_GATE.has(r));
    expect(
      desconhecidas,
      "rota de escrita sem requireRole: ela escapa do gate de expediente. Use requireRole ou registre aqui com a categoria",
    ).toEqual([]);
  });

  it("a lista de fora-do-alcance não aponta para rota que sumiu ou ganhou requireRole", () => {
    const porRota = new Map(escrita.map((r) => [r.rota, r.fonte]));
    for (const r of FORA_DO_ALCANCE_DO_GATE) {
      const fonte = porRota.get(r);
      expect(fonte, `${r} não é mais uma rota de escrita`).toBeDefined();
      expect(/requireRole\(/.test(fonte!), `${r} agora usa requireRole: tire-a da lista`).toBe(false);
    }
  });
});

/**
 * ── O que o gate NÃO alcança, por desenho — fixado aqui para ser DECISÃO e não esquecimento ──
 *
 * O gate vive em `requireRole`. Duas famílias de chamador não passam por ele:
 *
 *  1. CHAMADORES NÃO HUMANOS — o MCP e os tokens Bearer (`dsk_…`) autenticam por `lib/mcp/auth.ts`
 *     (`ensureRole`) e nunca chamam `requireRole`. O papel padrão de um token MCP é `agent` e ele
 *     escreve com `mcp:write`. O expediente é uma regra para ATENDENTES HUMANOS; o agente de IA tem a
 *     própria janela (`lib/agent-engine/agent/janela-de-atendimento.ts`) e uma integração
 *     servidor-a-servidor não tem "horário". Decisão a CONFIRMAR pelo dono do produto (#67).
 *  2. AUTOATENDIMENTO — perfil, idioma e MFA são Server Actions que autenticam só por
 *     `loadAuthUser`/`getUser`. Não chamam `requireRole`, então o gate não as alcança: barrar o
 *     cadastro de MFA fora do horário trancaria quem a organização OBRIGA a ter MFA.
 *
 * Se alguém ligar `requireRole` numa destas, os testes abaixo reprovam e a decisão tem de ser tomada.
 */
function arquivos(dir: string, ext: RegExp): string[] {
  const achados: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) achados.push(...arquivos(caminho, ext));
    else if (ext.test(nome)) achados.push(caminho);
  }
  return achados;
}

describe("o que o gate NÃO alcança, por desenho", () => {
  const raiz = process.cwd();
  const usaRequireRole = (arquivo: string) => /requireRole\s*\(|from\s+["']@\/lib\/auth\/require-role["']/.test(readFileSync(arquivo, "utf8"));

  it("controle positivo: a varredura enxerga o MCP e as Server Actions", () => {
    expect(arquivos(join(raiz, "lib", "mcp"), /\.ts$/).filter((f) => !f.endsWith(".test.ts")).length).toBeGreaterThan(5);
    expect(arquivos(join(raiz, "app", "actions"), /\.ts$/).length).toBeGreaterThan(20);
  });

  it("MCP e tokens Bearer (chamadores não humanos) NÃO passam pelo gate de expediente", () => {
    const mcp = [
      ...arquivos(join(raiz, "lib", "mcp"), /\.ts$/),
      ...arquivos(join(raiz, "app", "api", "mcp"), /\.ts$/),
    ].filter((f) => !f.endsWith(".test.ts"));
    expect(mcp.filter(usaRequireRole).map((f) => relative(raiz, f))).toEqual([]);
  });

  it("autoatendimento (perfil, idioma, MFA, senha) NÃO passa pelo gate: nunca tranca quem tem MFA obrigatório", () => {
    const pessoais = [
      "app/actions/settings/updateProfile.ts",
      "app/actions/settings/trocarIdioma.ts",
      "app/actions/auth/enrollMfa.ts",
      "app/actions/auth/confirmMfaEnroll.ts",
      "app/actions/auth/verifyMfa.ts",
      "app/actions/auth/useRecoveryCode.ts",
      "app/actions/auth/updatePassword.ts",
    ];
    for (const rel of pessoais) {
      const arquivo = join(raiz, ...rel.split("/"));
      expect(statSync(arquivo).isFile(), `${rel} não existe mais: atualize a lista`).toBe(true);
      expect(usaRequireRole(arquivo), `${rel} passou a chamar requireRole: o gate o alcançaria`).toBe(false);
    }
  });

  it("NENHUMA Server Action chama requireRole — logo o gate não alcança nenhuma (a base já documenta: \"Server Action não é rota\")", () => {
    // Consequência a ter à vista: se uma Server Action passar a fazer trabalho de ATENDIMENTO (assumir,
    // responder), ela escapa do expediente. Hoje as de app/actions são auth, marca, equipe, integrações,
    // onboarding e shell; as de agentes de IA ficam em app/app/ai. Quem criar uma de atendimento deve
    // chamar o gate explicitamente.
    const chamam = arquivos(join(raiz, "app", "actions"), /.ts$/)
      .filter(usaRequireRole)
      .map((f) => relative(raiz, f).split(sep).join("/"));
    expect(chamam).toEqual([]);
  });
});
