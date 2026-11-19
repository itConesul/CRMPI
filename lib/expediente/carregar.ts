/**
 * Lê o expediente da organização (`organizations.settings.business_hours`) do banco.
 *
 * Separado de `expediente.ts` (que é puro) porque aqui há I/O. **Nunca lança** e **falha aberta**:
 * se a leitura falhar, o resultado é "sem expediente" e a equipe continua operando — um erro de
 * banco não pode virar "ninguém atende" (o mesmo princípio de `lerExpediente`). A falha é logada,
 * porque falhar aberto em silêncio esconderia um expediente que deveria estar valendo.
 *
 * O `db` recebido é o client do USUÁRIO, sob RLS (`orgs_select`), não o service role — é o que o
 * `02-design.md` (T0(a)) determina. `organization_id` é explícito e vem do chamador (`requireRole`,
 * que o resolveu de fonte confiável), nunca do body.
 *
 * Por que a RLS não esconde a linha: o gate só chega aqui com papel `agent` ATIVO, e
 * `fn_user_role_in_org` e `fn_user_org_ids` (a da policy) filtram ambas `revoked_at is null`. Membro
 * revogado já levou 403 por papel antes. Se as duas funções divergirem ou a policy endurecer, a linha
 * vem `null` SEM erro e o gate falha aberto — a spec vigia isso com um invariante de `test:db`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import type { ExpedienteConfig } from "@/lib/schemas/routing";

import { lerExpediente } from "./expediente";

export async function carregarExpediente(
  db: SupabaseClient,
  organizationId: string,
): Promise<ExpedienteConfig | null> {
  try {
    const { data, error } = await db
      .from("organizations")
      .select("settings")
      .eq("id", organizationId)
      .maybeSingle();
    if (error) {
      logger.warn("[expediente] leitura de business_hours falhou; seguindo sem expediente", {
        organization_id: organizationId,
        error: error.message,
      });
      return null;
    }
    const settings = (data as { settings?: Record<string, unknown> | null } | null)?.settings;
    return lerExpediente(settings?.business_hours);
  } catch (err) {
    logger.warn("[expediente] leitura de business_hours lançou; seguindo sem expediente", {
      organization_id: organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
