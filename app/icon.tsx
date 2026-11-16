import { ImageResponse } from "next/og";

import { CONE_SUL_PNG_DATA_URI } from "@/lib/branding/cone-sul";

/**
 * O ícone da aba: o cone da Cone Sul, em toda instalação.
 *
 * Decisão do dono do produto (2026-11-16): o produto é feito para a Cone Sul, então
 * o ícone deixou de ser cor da marca + inicial do nome. Isso SUBSTITUI a regra
 * anterior, que existia para um revendedor não herdar a nossa marca na aba.
 *
 * ─── O que continua valendo ─────────────────────────────────────────────────
 *
 * - **Nada de `public/favicon.ico`**: o PNG vai embutido (`lib/branding/cone-sul.ts`),
 *   sem requisição de saída e sem 404 possível. Também nunca busca `logo_url`
 *   (campo livre, sem CHECK de host: seria SSRF com gatilho em cada page load).
 * - **`/icon` em `PUBLIC_PATHS`** (`lib/auth/public-paths.ts`): o matcher do
 *   `proxy.ts` só dispensa caminho COM extensão, e sem a entrada o ícone responde
 *   307 para `/login` a quem ainda não entrou.
 * - **Na raiz de `app/`**, nunca em route group (o Next acrescentaria um hash ao caminho).
 */

export const dynamic = "force-dynamic";

/** 64 e não 32: a aba pede 16-32 CSS px, e em tela retina isso são 32-64 reais. */
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Fundo transparente: o cone é a marca, sem ladrilho de cor por baixo.
        }}
      >
        {/* Tamanho EXPLÍCITO, na proporção do PNG (186x195): com `width: auto` o satori
            não desenha a imagem e o ícone sai em branco (medido: 117 bytes, 100% transparente). */}
        {/* eslint-disable-next-line @next/next/no-img-element -- satori, não DOM */}
        <img src={CONE_SUL_PNG_DATA_URI} alt="" width={61} height={64} />
      </div>
    ),
    {
      ...size,
      headers: {
        // O cone não muda por operador, mas 1 dia (e não `immutable`) deixa uma
        // troca futura do arquivo chegar às abas sem depender de limpar cache.
        "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    },
  );
}
