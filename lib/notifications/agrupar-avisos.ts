/**
 * Agrupa os avisos de mensagem recebida: um por conversa, e um resumo quando a
 * rajada vem de conversas demais.
 *
 * ─── O defeito que isto previne ─────────────────────────────────────────────
 *
 * Cada mensagem do WhatsApp virava um toast e uma notificação do sistema. Numa
 * rajada (o canal entregando o que acumulou, uma campanha respondida de uma vez) o
 * atendente recebia dezenas de avisos e o navegador, dezenas de chamadas para
 * buscar nome e foto. WhatsApp Web e Google Chat fazem o contrário: UM aviso por
 * conversa, que vira "N novas mensagens".
 *
 * ─── A regra ────────────────────────────────────────────────────────────────
 *
 * - O primeiro aviso de uma conversa sai NA HORA (uso normal não fica mais lento).
 * - O que chega dessa conversa dentro da janela vira UMA atualização ao fim dela,
 *   com a contagem total — e só se houve algo novo (janela quieta não emite nada).
 * - A contagem é de mensagens ainda não vistas: sobe até `zerar(conversa)`.
 * - Se mais de `limiteDeConversas` conversas estão ativas na janela, as de fora
 *   não ganham aviso próprio: viram UM resumo ("N novas mensagens em M conversas").
 *
 * Função de fábrica pura, sem DOM e com o relógio injetável: a regra é o que
 * importa e precisa ser provada sem navegador.
 */
export interface MensagemRecebida {
  conversationId: string;
  contactId: string | null;
  preview: string;
}

export type Emissao =
  | {
      tipo: "conversa";
      conversationId: string;
      contactId: string | null;
      preview: string;
      /** Mensagens ainda não vistas desta conversa, contando esta. */
      total: number;
    }
  | { tipo: "resumo"; mensagens: number; conversas: number };

export interface OpcoesDoAgrupador {
  emitir: (e: Emissao) => void;
  janelaMs: number;
  limiteDeConversas: number;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (t: ReturnType<typeof setTimeout>) => void;
}

interface Estado {
  total: number;
  pendentes: number;
  preview: string;
  contactId: string | null;
  timer: ReturnType<typeof setTimeout> | null;
}

export function criarAgrupadorDeAvisos(op: OpcoesDoAgrupador): {
  avisar: (m: MensagemRecebida) => void;
  zerar: (conversationId: string) => void;
  zerarTudo: () => void;
} {
  const setT = op.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearT = op.clearTimer ?? ((t) => clearTimeout(t));
  const estados = new Map<string, Estado>();

  let resumoTimer: ReturnType<typeof setTimeout> | null = null;
  let resumoMensagens = 0;
  const resumoConversas = new Set<string>();

  const conversasNaJanela = (): number => {
    let n = 0;
    for (const e of estados.values()) if (e.timer !== null) n += 1;
    return n;
  };

  const fimDaJanela = (id: string): void => {
    const e = estados.get(id);
    if (!e) return;
    e.timer = null;
    if (e.pendentes === 0) return;
    e.pendentes = 0;
    op.emitir({
      tipo: "conversa",
      conversationId: id,
      contactId: e.contactId,
      preview: e.preview,
      total: e.total,
    });
    // Emitiu ao fim da janela: abre outra, para a rajada que continua não furar o
    // teto de um aviso por conversa por janela.
    e.timer = setT(() => fimDaJanela(id), op.janelaMs);
  };

  const fimDoResumo = (): void => {
    resumoTimer = null;
    if (resumoMensagens === 0) return;
    const mensagens = resumoMensagens;
    const conversas = resumoConversas.size;
    resumoMensagens = 0;
    resumoConversas.clear();
    op.emitir({ tipo: "resumo", mensagens, conversas });
    resumoTimer = setT(fimDoResumo, op.janelaMs);
  };

  return {
    avisar(m) {
      let e = estados.get(m.conversationId);
      if (!e) {
        e = { total: 0, pendentes: 0, preview: "", contactId: null, timer: null };
        estados.set(m.conversationId, e);
      }
      e.total += 1;
      e.preview = m.preview;
      e.contactId = m.contactId ?? e.contactId;

      // Conversa já avisada nesta janela: só acumula; sai ao fim dela.
      if (e.timer !== null) {
        e.pendentes += 1;
        return;
      }

      // Rajada em conversas demais: não ganha aviso próprio, entra no resumo.
      if (conversasNaJanela() >= op.limiteDeConversas) {
        resumoMensagens += 1;
        resumoConversas.add(m.conversationId);
        if (resumoTimer === null) resumoTimer = setT(fimDoResumo, op.janelaMs);
        return;
      }

      op.emitir({
        tipo: "conversa",
        conversationId: m.conversationId,
        contactId: e.contactId,
        preview: e.preview,
        total: e.total,
      });
      e.pendentes = 0;
      e.timer = setT(() => fimDaJanela(m.conversationId), op.janelaMs);
    },

    /** O atendente viu esta conversa: a contagem recomeça e nada pendente sai. */
    zerar(conversationId) {
      const e = estados.get(conversationId);
      if (e?.timer) clearT(e.timer);
      estados.delete(conversationId);
    },

    /** O atendente voltou para a aba: tudo o que estava acumulado foi visto. */
    zerarTudo() {
      for (const e of estados.values()) if (e.timer) clearT(e.timer);
      estados.clear();
      if (resumoTimer) clearT(resumoTimer);
      resumoTimer = null;
      resumoMensagens = 0;
      resumoConversas.clear();
    },
  };
}
