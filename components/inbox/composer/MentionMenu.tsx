/**
 * Autocomplete de `@usuário` nas notas internas (spec #69, `docs/specs/sdd/69-autocomplete-mencao/`).
 *
 * Este arquivo reúne o gatilho puro e a troca do trecho (T2). O componente `MentionMenu`
 * (lista, teclado, i18n) entra na T3.
 */

/** Onde o `@` em edição está e o que já foi digitado depois dele. */
export interface MencaoEmEdicao {
  aberto: boolean;
  /** Texto digitado depois do `@`, sem espaço. Vazio quando fechado. */
  consulta: string;
  /** Posição do `@`; o trecho a trocar é `[inicio, fim)`. */
  inicio: number;
  /** Posição do cursor. */
  fim: number;
}

/**
 * Estado do autocomplete a partir do texto e do cursor. Puro (testável).
 *
 * Abre só quando o `@` mais próximo antes do cursor está no começo do texto ou depois de
 * espaço/quebra de linha (para não abrir dentro de `ana@clinica.com`), e nada entre o `@`
 * e o cursor é espaço. A consulta vai até o cursor, não até o fim do texto.
 */
export function resolverMencao(texto: string, cursor: number): MencaoEmEdicao {
  const fim = Math.min(Math.max(cursor, 0), texto.length);
  const fechado: MencaoEmEdicao = { aberto: false, consulta: "", inicio: fim, fim };

  const inicio = texto.lastIndexOf("@", fim - 1);
  if (fim === 0 || inicio < 0) return fechado;

  const antes = texto.charAt(inicio - 1); // "" quando o `@` abre o texto
  if (antes !== "" && !/\s/.test(antes)) return fechado;

  const consulta = texto.slice(inicio + 1, fim);
  if (/\s/.test(consulta)) return fechado;

  return { aberto: true, consulta, inicio, fim };
}

/**
 * Troca o trecho `[inicio, fim)` por `@<token>` mais UM espaço, sem alterar o resto do
 * texto, e devolve o cursor logo depois do espaço inserido (RF-3, CA-5).
 */
export function inserirMencao(
  texto: string,
  trecho: Pick<MencaoEmEdicao, "inicio" | "fim">,
  token: string,
): { texto: string; cursor: number } {
  const inserido = `@${token} `;
  return {
    texto: texto.slice(0, trecho.inicio) + inserido + texto.slice(trecho.fim),
    cursor: trecho.inicio + inserido.length,
  };
}
