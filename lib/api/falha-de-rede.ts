/**
 * A chamada que NÃO obteve resposta nenhuma do servidor.
 *
 * ─── O defeito que isto previne ─────────────────────────────────────────────
 *
 * Quando o `fetch` falhava (timeout de 10 s, rede caída, conexão recusada) o
 * cliente repetia a tentativa e, esgotadas, relançava o erro CRU do navegador —
 * um `TypeError: Failed to fetch` ou um `AbortError`. Esse erro não é `ApiError`,
 * então o toast caía em "Erro inesperado. Tente novamente.", sem causa e sem
 * identificador. Pior: o servidor não vê a chamada que não chegou, então não há
 * log, audit nem id a procurar. Dois toasts desses custaram uma rodada inteira
 * de busca por ids que não existiam em lugar nenhum.
 *
 * ─── A regra ────────────────────────────────────────────────────────────────
 *
 * Falha SEM resposta vira `FalhaDeRede`: diz POR QUE (prazo, sem internet, ou
 * rede/conexão) e carrega o `X-Request-Id` que o navegador mandou, o método, o
 * caminho (sem a query) e quanto tempo levou. É a única pista que existe, porque
 * a do servidor não existe.
 */
export type CausaDaFalha = "timeout" | "offline" | "rede";

export class FalhaDeRede extends Error {
  constructor(
    public readonly causa: CausaDaFalha,
    public readonly requestId: string,
    public readonly metodo: string,
    /** Caminho sem query: `?q=` pode carregar o que a pessoa digitou. */
    public readonly caminho: string,
    public readonly tentativas: number,
    public readonly duracaoMs: number,
    public readonly original?: unknown,
  ) {
    super(`${causa}: ${metodo} ${caminho} (${tentativas} tentativa(s), ${duracaoMs} ms)`);
    this.name = "FalhaDeRede";
  }
}

export function caminhoSemQuery(path: string): string {
  const i = path.search(/[?#]/);
  return i === -1 ? path : path.slice(0, i);
}

/**
 * `estourouPrazo` vem de quem armou o relógio (o cliente sabe que foi ELE quem
 * abortou); adivinhar pelo nome do erro confundiria o prazo com o cancelamento
 * de quem chamou. `online` é `navigator.onLine`: `false` é confiável (o
 * navegador SABE que está sem rede), `true` não prova nada — por isso só o
 * `false` muda a causa.
 */
export function classificarFalha(op: { estourouPrazo: boolean; online: boolean }): CausaDaFalha {
  if (op.estourouPrazo) return "timeout";
  if (!op.online) return "offline";
  return "rede";
}
