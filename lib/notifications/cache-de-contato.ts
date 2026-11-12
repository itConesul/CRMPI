/**
 * Guarda nome e foto do contato para o aviso de mensagem.
 *
 * ─── O defeito que isto previne ─────────────────────────────────────────────
 *
 * Cada mensagem recebida fazia DUAS chamadas HTTP (nome e foto) e não guardava
 * nada. Numa rajada de 50 mensagens da mesma pessoa eram 100 chamadas, disputando
 * as poucas conexões que o navegador abre por origem com o resto da tela — e a
 * leitura que falhava era refeita a cada mensagem.
 *
 * ─── A regra ────────────────────────────────────────────────────────────────
 *
 * - Uma consulta por contato por validade; quem pede enquanto ela voa recebe a
 *   MESMA promessa (nunca duas consultas ao mesmo tempo).
 * - Consulta que não trouxe o nome (`completo: false`) vale pouco: tenta de novo
 *   logo, mas não a cada mensagem.
 * - A foto é uma URL assinada do Storage, que expira: a validade do que deu certo
 *   é de minutos, não de horas.
 * - O mapa tem teto, para uma sessão longa não crescer sem fim.
 */
export interface BitsDoContato {
  title: string;
  icon?: string;
}

export const TITULO_GENERICO = "Nova mensagem";

export interface OpcoesDoCache {
  validadeMs: number;
  validadeFalhaMs: number;
  maximo?: number;
  agora?: () => number;
}

interface Entrada {
  promessa: Promise<BitsDoContato>;
  /** `Infinity` enquanto a consulta voa. */
  ate: number;
}

export function criarCacheDeContato(
  buscar: (contactId: string) => Promise<BitsDoContato>,
  op: OpcoesDoCache,
): { obter: (contactId: string) => Promise<BitsDoContato>; tamanho: () => number } {
  const agora = op.agora ?? (() => Date.now());
  const maximo = op.maximo ?? 200;
  const mapa = new Map<string, Entrada>();

  return {
    obter(contactId) {
      const existente = mapa.get(contactId);
      if (existente && agora() < existente.ate) return existente.promessa;

      const entrada: Entrada = { promessa: Promise.resolve({ title: TITULO_GENERICO }), ate: Infinity };
      entrada.promessa = buscar(contactId).then(
        (bits) => {
          const completo = bits.title !== TITULO_GENERICO;
          entrada.ate = agora() + (completo ? op.validadeMs : op.validadeFalhaMs);
          return bits;
        },
        () => {
          entrada.ate = agora() + op.validadeFalhaMs;
          return { title: TITULO_GENERICO } as BitsDoContato;
        },
      );
      mapa.delete(contactId);
      mapa.set(contactId, entrada);
      if (mapa.size > maximo) {
        const maisAntiga = mapa.keys().next().value;
        if (maisAntiga !== undefined) mapa.delete(maisAntiga);
      }
      return entrada.promessa;
    },
    tamanho: () => mapa.size,
  };
}
