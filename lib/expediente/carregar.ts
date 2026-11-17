/**
 * Lê o expediente da organização (`organizations.settings.business_hours`) do banco.
 *
 * Separado de `expediente.ts` (que é puro) porque aqui há I/O. **Nunca lança** e **falha aberta**:
 * se a leitura falhar, o resultado é "sem expediente" e a equipe continua operando — um erro de
 * banco não pode virar "ninguém atende" (o mesmo princípio de `lerExpediente`). A falha é logada,
 * porque falhar aberto em silêncio esconderia um expediente que deveria estar valendo.
 *
 * Service role e `organization_id` EXPLÍCITO, resolvido de fonte confiável pelo chamador (cookie,
 * JWT, webhook) e nunca do body — doutrina de multi-tenancy do repo.
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
