/**
 * RF-10 (PRD-01 / #67, T2c): quando `admin`/`manager` — e platform admin e sessão de suporte, por
 * decisão do dono em 2026-11-23 — agem FORA do expediente, a linha de `api_audit_log` da mutação que o
 * `audit()` já ia gravar ganha `metadata.fora_do_expediente = true`. Não nasce linha nova.
 *
 * Quem decide é o próprio `audit()` (`02-design.md` §2.1), e não a rota: 168 rotas chamam
 * `requireRole`, mas 68 arquivos FORA de `route.ts` chamam `audit()`, e uma rota esquecida seria um
 * bypass sem rastro. O `requireRole` não muda por causa disto.
 *
 * As regras são avaliadas do barato ao caro; a primeira que falhar encerra SEM marcar. Falha de
 * qualquer passo nunca atrapalha a gravação: quem chama (`audit()`) captura, registra e grava a linha
 * sem o campo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { expedienteBarra } from "@/lib/expediente/expediente";
import { expedienteParaAudit } from "@/lib/expediente/cache-do-audit";
import { metodoEhEscrita } from "@/lib/expediente/metodo";

/**
 * Ações de audit que NUNCA recebem a marca (decisão do dono, 2026-11-23, ponto 6; lista final
 * vinda da medição da T2c). São a recusa e o autoatendimento de sessão, não "trabalho fora do
 * horário": um `admin` que sai do sistema às 23h geraria uma marca que desvaloriza a marca.
 *
 *  - `authz.denied`: a RECUSA do `requireRole`, não a ação.
 *  - a família `auth.` (19 códigos hoje: login, logout, MFA de entrada, recuperação de senha,
 *    cadastro): Server Actions de sessão também são `POST` com ator humano e o carimbo de método as
 *    alcança (medido), então sem a exclusão elas marcariam.
 *  - `organization.switched` e `profile.updated`: troca de organização e edição do próprio perfil são
 *    as isenções fixas do `agent` (`02-design.md` §2.1) e as Server Actions que as auditam são de
 *    sessão/perfil. **Decisão do dono** (2026-11-25, no PR #127, registrada em
 *    `05-revisao.md`), somada à de `authz.denied` e `auth.`.
 *
 * Fica de FORA da lista, de propósito: `security.mfa_desativada` e `mfa.recovery_codes_regenerated`.
 * Desativar a verificação em duas etapas, ou regenerar os códigos, às 23h é exatamente o tipo de ação
 * que a marca existe para destacar.
 */
export const ACOES_EXATAS_QUE_NAO_MARCAM: readonly string[] = [
  "authz.denied",
  "organization.switched",
  "profile.updated",
];
/** Prefixo da família de sessão (`auth.login_success`, `auth.logout`, ...). Note: `authz.` NÃO começa com `auth.`. */
export const PREFIXO_DE_SESSAO_QUE_NAO_MARCA = "auth.";

export function acaoNaoMarca(action: string): boolean {
  return ACOES_EXATAS_QUE_NAO_MARCAM.includes(action) || action.startsWith(PREFIXO_DE_SESSAO_QUE_NAO_MARCA);
}

export interface EntradaDaMarca {
  action: string;
  actorUserId?: string | null;
  actorApiTokenId?: string | null;
  organizationId?: string | null;
  actingAsPlatformAdmin?: boolean;
}

export interface ContextoDaMarca {
  /**
   * O método HTTP carimbado pelo `proxy.ts`. É uma PROMESSA criada na primeira instrução do `audit()`,
   * antes de qualquer `await`, para a leitura não depender de o contexto da requisição sobreviver ao
   * fim da resposta (as 125 chamadas `void audit()`). Medido: funciona também lida depois.
   */
  metodo: Promise<string | null>;
  /** `support_session_id` já resolvido pelo `audit()`; presente = sessão de suporte. */
  supportSessionId?: string | null;
  /**
   * A sessão (cookie) É o ator? Só `true` quando o `audit()` já conferiu
   * `auth.getUser().id === actorUserId`. Sem isso a `rpc` de papel leria o papel de OUTRA pessoa.
   */
  sessaoEhOAtor: boolean;
  /** O client da SESSÃO (a `rpc` usa o `auth.uid()` dela e a leitura do expediente segue a RLS). */
  db: SupabaseClient | null;
  /** O relógio é o do `audit()`, não o do gate. */
  agora: Date;
}

export async function deveMarcarForaDoExpediente(e: EntradaDaMarca, c: ContextoDaMarca): Promise<boolean> {
  // 1. Ator humano de sessão numa organização. Worker, cron, Bearer, MCP, IA e ingestão ficam de fora.
  if (!e.actorUserId || !e.organizationId || e.actorApiTokenId) return false;

  // 2. É uma mutação — e não uma das ações de recusa/sessão excluídas por nome.
  if (acaoNaoMarca(e.action)) return false;
  const metodo = await c.metodo;
  // Método AUSENTE não marca: o oposto do gate (fail-closed para barrar; aqui fail-open para marcar).
  // Deixa de fora, sem regra extra, tudo o que roda sem requisição e as rotas GET que auditam leitura.
  if (metodo === null || metodo === undefined || !metodoEhEscrita(metodo)) return false;

  // 3. O expediente (cache de 30 s, só do audit()). Sem expediente, inválido ou dentro do horário: não marca.
  if (!c.db) return false;
  const config = await expedienteParaAudit(c.db, e.organizationId, c.agora.getTime());
  if (!config) return false;
  const fora = expedienteBarra({ papel: "admin", config, agora: c.agora }).foraDoExpediente;
  if (!fora) return false;

  // 4. Quem age. Platform admin e sessão de suporte MARCAM e NÃO dependem da `rpc` de papel (ela
  //    devolve `null` para o platform admin sem vínculo): `support_session_id` e `actingAsPlatformAdmin`
  //    já estão no `audit()` na hora de gravar.
  if (c.supportSessionId || e.actingAsPlatformAdmin) return true;

  //    Os demais: o papel vem de `fn_user_role_in_org` (a MESMA fonte do `requireRole`), e só depois da
  //    guarda de identidade. `agent` nunca marca, nem em rota isenta: isenção é "não é barrado ali".
  if (!c.sessaoEhOAtor) return false;
  const { data: papel, error } = await c.db.rpc("fn_user_role_in_org", { p_org: e.organizationId });
  if (error) throw new Error(`fn_user_role_in_org: ${error.message}`);
  if (papel !== "admin" && papel !== "manager") return false;
  return expedienteBarra({ papel, config, agora: c.agora }).bypassAuditado;
}
