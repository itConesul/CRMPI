import { ROLE_RANK, type Role } from "@/lib/auth/types";

/**
 * Papel mínimo para APAGAR contato (#99, RF-5/RF-6; spec `docs/specs/sdd/99-conversa-nao-se-apaga/`).
 *
 * A rota `DELETE /api/v1/contacts/[id]` pede este papel ao `requireRole`, e o botão "Excluir contato"
 * da lista usa `podeExcluirContato`. Os dois leem ESTA constante: a regra mora no servidor, e a tela só
 * a espelha — esconder o botão sem endurecer a rota deixaria a porta aberta, e endurecer a rota sem
 * esconder o botão mostraria um botão que só devolve 403.
 *
 * Contato com conversa ou compromisso não é apagado nem por quem pode: o banco recusa (FK) e a rota
 * responde 409 mandando pedir a um administrador para anonimizar.
 */
export const PAPEL_MINIMO_PARA_EXCLUIR_CONTATO = "manager" as const satisfies Role;

/**
 * `role` é o papel EFETIVO na organização ativa (`useActiveOrg().role`). Não se soma
 * `is_platform_admin`: um platform admin sem membership na org teria o papel nulo na rota (403), e a
 * tela não pode prometer o que a rota nega (spec `02-design.md` §1.3). A sessão de suporte `full` já
 * chega aqui como `admin`.
 */
export function podeExcluirContato(role: Role | null | undefined): boolean {
  return role != null && ROLE_RANK[role] >= ROLE_RANK[PAPEL_MINIMO_PARA_EXCLUIR_CONTATO];
}
