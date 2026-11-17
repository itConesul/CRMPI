/**
 * O cone da Cone Sul, em PNG (186x195, com transparência), embutido como data URI.
 *
 * Embutido e não buscado: o `/icon` roda em TODA página, e uma requisição de
 * saída a cada page load é o que `app/icon.tsx` sempre recusou. Também não é
 * arquivo em `public/` — o `ImageResponse` precisa dos bytes na mão, e assim não
 * há pedido extra nem 404 possível.
 *
 * Decisão do dono do produto (2026-11-16): o ícone da aba é o cone em TODA
 * instalação, inclusive de revendedor — "estamos fazendo o produto para a Cone Sul".
 * Isso SUBSTITUI a regra anterior (cor da marca + inicial do nome).
 */
export const CONE_SUL_PNG_DATA_URI =
  "data:image/png;base64," +
  "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";
