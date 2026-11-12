import { apiClient } from "@/lib/api/client";
import { rotuloDoContato, SEM_NOME, type ContatoNomeavel } from "@/lib/contacts/rotulo-do-contato";

import { avatarUrlServivel } from "./avatar_url";
import { TITULO_GENERICO, type BitsDoContato } from "./cache-de-contato";

/**
 * Nome e foto do contato para o aviso de mensagem nova.
 *
 * ⚠️ O nome NÃO sai do Supabase do navegador. O cookie de sessão é httpOnly, então
 * o `createClient()` do browser age como ANÔNIMO — `contacts` não dá permissão a
 * esse papel e o PostgREST responde 401. O aviso caía em "Nova mensagem" sem ninguém
 * ver o porquê. A leitura passa pela rota do app, que tem a sessão.
 *
 * ⚠️ A foto é buscada SEM `credentials: "include"`. A rota responde 302 para uma URL
 * assinada do Storage, que devolve `Access-Control-Allow-Origin: *`; o navegador
 * proíbe `*` quando a requisição leva credenciais e bloqueava o redirect por CORS.
 * O padrão (`same-origin`) manda o cookie à nossa rota e segue o redirect sem ele.
 *
 * Quem chama por mensagem passa pelo cache (`cache-de-contato.ts`): esta função
 * faz DUAS chamadas e não guarda nada.
 */
export async function contactNotifyBits(contactId: string): Promise<BitsDoContato> {
  let title = TITULO_GENERICO;
  try {
    const r = await apiClient.get<{ data?: ContatoNomeavel }>(`/api/v1/contacts/${contactId}`);
    // A cadeia de nome é UMA só no produto (`rotuloDoContato`): ela não deixa
    // identificador técnico (`@lid`) virar nome e usa o telefone antes de desistir.
    // Remontá-la aqui seria a sétima cópia — o que `rotulo-do-contato.test.ts` proíbe.
    const rotulo = rotuloDoContato(r.data);
    if (rotulo !== SEM_NOME) title = rotulo;
  } catch {
    // sem nome: o aviso sai genérico, como sempre saiu quando a leitura falhava
  }
  let icon: string | undefined;
  try {
    const r = await fetch(`/api/v1/contacts/${contactId}/avatar`, { redirect: "follow" });
    icon = r.ok ? avatarUrlServivel(r.url, window.location.origin) : undefined;
  } catch {
    // sem foto: badge da marca
  }
  return { title, icon };
}
