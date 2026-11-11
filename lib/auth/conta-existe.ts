import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Este e-mail já tem conta confirmada?
 *
 * ⚠️ SÓ chame depois de `verifyInviteToken` aceitar o token. A resposta é um
 * oráculo de "este e-mail está cadastrado"; ela é segura aqui porque quem chega
 * a esta pergunta tem o link assinado para aquele e-mail — o mesmo e-mail que
 * recebeu o convite — e a rota tem teto de tentativas (`invite_accept`). Em rota
 * aberta, a mesma pergunta violaria a anti-enumeração do `signUp`.
 *
 * Devolve `null` quando não deu para saber. Nunca lança: a tela do convite roda
 * para quem ainda não tem sessão, e um throw aqui é um 500 na primeira impressão.
 */
export async function contaExistePorEmail(email: string): Promise<boolean | null> {
  try {
    const { data, error } = await createAdminClient().rpc("fn_conta_existe_por_email", {
      p_email: email,
    });
    if (error || typeof data !== "boolean") return null;
    return data;
  } catch {
    return null;
  }
}
