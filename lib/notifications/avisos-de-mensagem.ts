import { idiomaAtual } from "@/lib/i18n/IdiomaProvider";
import { traduzir } from "@/lib/i18n/dicionario";

import { criarAgrupadorDeAvisos, type Emissao, type MensagemRecebida } from "./agrupar-avisos";
import { criarCacheDeContato, TITULO_GENERICO } from "./cache-de-contato";
import { contactNotifyBits } from "./contato-do-aviso";
import { entregarAviso } from "./deliver";

/** Janela em que uma conversa recebe UM aviso (o resto vira "N novas mensagens"). */
export const JANELA_DOS_AVISOS_MS = 3_000;
/** Conversas com aviso próprio por janela; as de fora entram no resumo. */
export const LIMITE_DE_CONVERSAS = 3;

const cache = criarCacheDeContato(contactNotifyBits, {
  validadeMs: 5 * 60_000,
  validadeFalhaMs: 30_000,
});

async function emitir(e: Emissao): Promise<void> {
  const t = (texto: string) => traduzir(texto, idiomaAtual());

  if (e.tipo === "resumo") {
    entregarAviso({
      category: "message",
      kind: "message_inbound",
      title: t("Novas mensagens"),
      body: `${e.mensagens} ${t("novas mensagens em")} ${e.conversas} ${t("conversas")}`,
      tag: "resumo",
      id: "msg:resumo",
      href: "/app/inbox",
    });
    return;
  }

  const bits = e.contactId
    ? await cache.obter(e.contactId)
    : { title: TITULO_GENERICO, icon: undefined };
  entregarAviso({
    category: "message",
    kind: "message_inbound",
    title: bits.title === TITULO_GENERICO ? t(TITULO_GENERICO) : bits.title,
    body: e.total > 1 ? `${e.total} ${t("novas mensagens")} · ${e.preview}` : e.preview,
    tag: e.conversationId,
    // O toast da MESMA conversa substitui o anterior em vez de empilhar.
    id: `msg:${e.conversationId}`,
    href: `/app/inbox?id=${e.conversationId}`,
    icon: bits.icon,
  });
}

let agrupador: ReturnType<typeof criarAgrupadorDeAvisos> | null = null;

function obter(): ReturnType<typeof criarAgrupadorDeAvisos> {
  agrupador ??= criarAgrupadorDeAvisos({
    emitir: (e) => void emitir(e),
    janelaMs: JANELA_DOS_AVISOS_MS,
    limiteDeConversas: LIMITE_DE_CONVERSAS,
  });
  return agrupador;
}

export function avisarMensagem(m: MensagemRecebida): void {
  obter().avisar(m);
}

export function zerarAvisosDaConversa(conversationId: string): void {
  agrupador?.zerar(conversationId);
}

export function zerarAvisosDeMensagem(): void {
  agrupador?.zerarTudo();
}
