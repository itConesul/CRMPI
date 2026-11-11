/**
 * Para onde vai quem abre o link do convite sem sessão.
 *
 * Antes a tela mostrava "Fazer login" e "Ainda não tenho conta" e deixava a
 * pessoa adivinhar em qual das duas estava. O convite já diz o e-mail, e o
 * servidor sabe se esse e-mail tem conta — então a escolha é dele.
 *
 * Função PURA de propósito: a decisão é o que importa e se prova sem banco.
 *
 * `contaExiste === null` é "não consegui saber" (a consulta falhou). Nesse caso
 * a tela volta a oferecer as duas portas, como era: errar para o lado de pedir à
 * pessoa que escolha é pior que acertar, mas é melhor que errar de caminho.
 */
export type DestinoDoConvite =
  | { tipo: "entrar"; href: string }
  | { tipo: "cadastrar"; href: string }
  | { tipo: "escolher" };

export function destinoDoConvite(
  token: string,
  email: string,
  contaExiste: boolean | null,
): DestinoDoConvite {
  if (contaExiste === true) {
    const next = encodeURIComponent(`/team/accept-invite/${token}`);
    return {
      tipo: "entrar",
      href: `/login?next=${next}&email=${encodeURIComponent(email)}`,
    };
  }
  if (contaExiste === false) {
    return { tipo: "cadastrar", href: `/signup?invite=${encodeURIComponent(token)}` };
  }
  return { tipo: "escolher" };
}
