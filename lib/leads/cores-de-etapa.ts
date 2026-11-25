/**
 * A paleta de cores do cabeçalho das colunas do funil.
 *
 * ⚠️ PALETA FIXA, NÃO COR LIVRE — e a razão é o texto, não o gosto. O cabeçalho
 * da coluna é PINTADO com a cor e leva o nome da etapa por cima. Com cor livre,
 * qualquer amarelo-claro escolhido por alguém entregaria texto ilegível numa
 * tela que a equipe lê o dia inteiro. Aqui cada cor já nasce conferida: o teste
 * `cores-de-etapa.test.ts` mede o contraste de TODAS contra o texto que a tela
 * usa e reprova se uma entrar abaixo de 4,5:1 (WCAG 1.4.3).
 *
 * ⚠️ A COR DO TEXTO NUNCA É ESCOLHA DE QUEM CONFIGURA. Ela sai de
 * `frenteDoCabecalho()`, calculada sobre o fundo — o mesmo cálculo de
 * `--color-accent-fg` na marca. Por isso o quadro continua legível até para uma
 * cor que NÃO é da paleta: etapas criadas antes desta tela (ou pela API de uma
 * versão anterior) podem ter uma `color` qualquer, e o cabeçalho delas é pintado
 * do mesmo jeito, com o texto certo.
 *
 * ⚠️ O TEMA É SEMPRE CLARO (desde a 1.24.0). A paleta só é medida contra a frente
 * calculada, e não contra superfícies do tema, justamente porque o cabeçalho
 * pintado é opaco e não depende do que está atrás dele.
 *
 * O nome de cada cor é o que a pessoa lê na tela; o `hex` é o que vai para
 * `crm_stages.color` (`crm_stages_color_format`: nulo ou `#RRGGBB`).
 */
import { melhorFrenteSobre } from "@/lib/branding/contraste";

export interface CorDeEtapa {
  /** Chave estável, para teste e para `data-testid`. Nunca vai para o banco. */
  id: string;
  /** O que a pessoa lê. Passa por `t()` na tela. */
  rotulo: string;
  /** `#rrggbb` em minúsculas — a forma única que `normalizarCorDeEtapa` devolve. */
  hex: string;
}

export const CORES_DE_ETAPA: readonly CorDeEtapa[] = [
  { id: "verde-cone-sul", rotulo: "Verde Cone Sul", hex: "#506d48" },
  { id: "azul", rotulo: "Azul", hex: "#1d4ed8" },
  { id: "roxo", rotulo: "Roxo", hex: "#7e22ce" },
  { id: "rosa", rotulo: "Rosa", hex: "#be185d" },
  { id: "vermelho", rotulo: "Vermelho", hex: "#b91c1c" },
  { id: "laranja", rotulo: "Laranja", hex: "#c2410c" },
  { id: "ambar", rotulo: "Âmbar", hex: "#b45309" },
  { id: "verde", rotulo: "Verde", hex: "#15803d" },
  { id: "petroleo", rotulo: "Azul-petróleo", hex: "#0f766e" },
  { id: "cinza", rotulo: "Cinza", hex: "#475569" },
] as const;

const POR_HEX: ReadonlyMap<string, CorDeEtapa> = new Map(CORES_DE_ETAPA.map((c) => [c.hex, c]));

/** A cor da paleta que corresponde a este hex (sem diferenciar maiúscula), ou `null`. */
export function corDaPaleta(hex: string | null | undefined): CorDeEtapa | null {
  if (!hex) return null;
  return POR_HEX.get(hex.trim().toLowerCase()) ?? null;
}

export type ResultadoDeCor = { ok: true; hex: string | null } | { ok: false; erro: string };

/**
 * Valida a cor pedida e devolve a forma que vai para o banco.
 *
 * `null` é um pedido legítimo: tira a cor e o cabeçalho volta ao aspecto de
 * fábrica. Só o que está na paleta passa — e a recusa diz o motivo em frase de
 * tela, sem o nome de constraint nenhuma.
 */
export function validarCorDeEtapa(cor: string | null): ResultadoDeCor {
  if (cor === null) return { ok: true, hex: null };
  const achada = corDaPaleta(cor);
  if (!achada) {
    return {
      ok: false,
      erro: "Escolha uma das cores da lista. Elas foram escolhidas para o nome da coluna continuar legível.",
    };
  }
  return { ok: true, hex: achada.hex };
}

/**
 * A cor do texto sobre o cabeçalho pintado: branco ou preto, o que contrastar
 * mais. Aceita qualquer `#rrggbb`, da paleta ou não — ver o cabeçalho do arquivo.
 */
export function frenteDoCabecalho(fundo: string): string {
  return melhorFrenteSobre(fundo);
}
