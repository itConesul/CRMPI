/**
 * O ID da requisição que a rota usa É o que o navegador enviou.
 *
 * O cliente (`lib/api/client.ts`) gera um UUID, manda em `X-Request-Id` e MOSTRA
 * esse ID no toast de falha. O `proxy.ts` já preserva o header. Mas a rota
 * fazia `randomUUID()` por conta própria — então o ID do toast nunca aparecia no
 * log nem no audit do servidor, justo no caso em que ele mais importa: quando o
 * servidor não respondeu a tempo e o toast é o único rastro.
 *
 * O header vem de fora, então não é confiável: só vale UUID. Qualquer outra coisa
 * (vazio, longo, com quebra de linha, forjado para poluir log) cai num UUID novo.
 */
import { randomUUID } from "node:crypto";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requestIdDe(req: Pick<Request, "headers">): string {
  const recebido = req.headers.get("x-request-id");
  return recebido !== null && UUID_RX.test(recebido) ? recebido : randomUUID();
}
