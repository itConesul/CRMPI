/**
 * Para onde vai quem está logado e NÃO pertence a organização nenhuma.
 *
 * O `/app` só faz sentido dentro de uma organização. Sem ela, o menu sai vazio e
 * a tela não diz o que fazer — foi o que um convidado viu ao criar a conta e cair
 * no perfil (issue #52). Então não há "acesso sem organização": há a porta certa.
 *
 * Reaproveita `decidirConviteDoSignup`, que já é a regra de segurança do convite
 * (assinatura HMAC + e-mail confirmado pelo provedor). Nada de regra nova aqui.
 *
 *  - convite válido     → aceite do convite (o botão que dá a organização)
 *  - convite que não vale → login com o aviso; NÃO abre empresa nova, porque a
 *    pessoa não estava abrindo uma
 *  - sem convite        → /get-started, a saída que já existe para criar a própria
 */
import { decidirConviteDoSignup } from "@/lib/auth/convite-no-signup";

export function portaSemOrganizacao(usuario: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): string {
  const decisao = decidirConviteDoSignup(usuario);
  if (decisao.tipo === "convite") return `/team/accept-invite/${decisao.token}`;
  if (decisao.tipo === "recusar") return "/login?error=convite_invalido";
  return "/get-started";
}
