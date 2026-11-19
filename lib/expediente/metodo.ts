/**
 * O método HTTP da requisição, como o `requireRole` o enxerga (PRD-01 / #67).
 *
 * Módulo PURO e sem `next/headers`, de propósito: o `proxy.ts` o importa e roda no Edge.
 *
 * ## Por que existe
 * O gate de expediente é **fail-closed**: fora do horário, todo método que não seja leitura é barrado
 * ao `agent` por padrão. Mas o `requireRole` não recebe a requisição (as 140 rotas de escrita o
 * chamam como `requireRole("agent", { requestId })`), então não conhece o método. O `proxy.ts` o
 * carimba num cabeçalho de requisição e o `requireRole` o lê por `headers()` — sem mexer em nenhuma
 * das rotas existentes.
 *
 * ## Por que não é forjável
 * O proxy SEMPRE sobrescreve o cabeçalho (`set`, nunca "se ausente"), e o matcher dele cobre
 * `/api/v1`. Um cliente que mande `x-metodo-http: GET` num `POST` é ignorado.
 */

/** Cabeçalho de requisição (interno, nunca de resposta) com o método HTTP real. */
export const HEADER_METODO_HTTP = "x-metodo-http";

const METODOS_DE_LEITURA = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * É uma ESCRITA? Fail-closed: método ausente ou desconhecido conta como escrita. Quem lê um `GET`
 * por engano como escrita só fica sem ler fora do expediente; quem lê uma escrita como `GET`
 * deixaria passar exatamente o que o gate existe para barrar.
 */
export function metodoEhEscrita(metodo: string | null | undefined): boolean {
  if (!metodo) return true;
  return !METODOS_DE_LEITURA.has(metodo.trim().toUpperCase());
}
