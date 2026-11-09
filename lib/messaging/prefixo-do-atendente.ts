/**
 * O NOME DO ATENDENTE NA BOLHA QUE O CLIENTE VÊ NO WHATSAPP.
 *
 * Toda mensagem de TEXTO escrita por uma pessoa sai do canal como
 *
 *     *Maria:*
 *     Bom dia, tudo bem?
 *
 * — nome em negrito, dois-pontos, e o texto do atendente na linha de baixo. O
 * cliente sabe com quem fala, e quando outra pessoa assume a conversa o nome da
 * bolha muda com ela.
 *
 * ── O que NÃO muda ──────────────────────────────────────────────────────────
 *
 * O `messages.body` continua sendo SÓ o que o atendente digitou. O Inbox já
 * mostra o nome acima da bolha (`components/inbox/autor-da-mensagem.ts`); gravar
 * o prefixo também no banco o desenharia duas vezes. O prefixo existe só no FIO.
 *
 * ── A armadilha que esta função existe para não armar ──────────────────────
 *
 * Todo envio do CRM volta do WhatsApp como eco `fromMe`, e o CRM só o reconhece
 * como seu comparando o CORPO com a linha ainda em voo (`ehEcoDeEnvioNosso`,
 * `lib/waha/ingest.ts`, issue #519). Com o prefixo, o eco traz o corpo PREFIXADO
 * e o da linha não: sem a conta abaixo, o eco viraria "humano digitou no
 * celular", duplicaria a mensagem e pausaria a IA. Por isso quem envia e quem
 * reconhece o eco usam ESTA mesma função — duas cópias da regra divergem.
 *
 * Só texto, só pessoa. Mídia nunca leva o nome; a IA e as automações têm o
 * próprio rótulo (`sent_via !== "user"`) e ficam como estão.
 */

const LIMITE_DO_NOME = 60;

/**
 * O nome como vai entre os asteriscos. `*`, `_`, `~` e crase são marcação do
 * WhatsApp: um nome com eles quebraria o negrito ou formataria o resto da linha.
 * Quebra de linha e espaços repetidos viram um espaço só. Vazio = sem prefixo,
 * e quem chama NÃO inventa "Atendente" (mesma regra do Inbox).
 */
export function nomeParaPrefixo(nome: string | null | undefined): string | null {
  if (!nome) return null;
  const limpo = nome
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LIMITE_DO_NOME)
    .trim();
  return limpo.length > 0 ? limpo : null;
}

/** O que vai ao canal: `*Nome:*\n<texto>`. Sem nome utilizável, o texto intacto. */
export function corpoComNomeDoAtendente(
  nome: string | null | undefined,
  corpo: string,
): string {
  const n = nomeParaPrefixo(nome);
  if (!n || corpo.length === 0) return corpo;
  return `*${n}:*\n${corpo}`;
}
