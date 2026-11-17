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
