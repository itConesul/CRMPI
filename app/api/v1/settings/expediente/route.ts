/**
 * GET   /api/v1/settings/expediente — lê o expediente da organização E o estado avaliado pelo
 *       servidor (`agora`, `dentro`, `opens_at`). `viewer`+ (qualquer membro): a faixa do shell chama
 *       esta rota para todo usuário logado, e o e2e constrói a janela em torno do `agora` do SERVIDOR,
 *       sem depender do relógio do runner.
 * PATCH /api/v1/settings/expediente — grava `organizations.settings.business_hours` (`admin`).
 *
 * PRD-01 (#67). O expediente mora no jsonb que já existe (`settings.business_hours`, Q2 aprovada):
 * esta rota NÃO exige migration. Falha ABERTA na leitura: configuração ausente ou torta não restringe
 * ninguém (ver `lib/expediente/expediente.ts`); a resposta distingue "não configurado" de "inválido"
 * para a tela poder avisar o admin.
 *
 * A escrita em `organizations` vai pelo client ADMIN pela mesma razão de `settings/routing`: a única
 * policy de escrita da tabela é de platform admin, e o `UPDATE` de um admin comum casaria ZERO linhas
 * e devolveria sucesso. O gate é o de cima (papel resolvido de fonte confiável) e o filtro por
 * `organization_id` é explícito.
 */
import type { NextRequest } from "next/server";

import { requestIdDe } from "@/lib/api/request-id";
import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { descartarExpedienteDoCache } from "@/lib/expediente/cache-do-audit";
import { descreverExpediente } from "@/lib/expediente/descrever";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { expedienteConfigSchema, validateRequest } from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = requestIdDe(req);
  // `viewer`, o PISO: a faixa do shell (`useExpediente`) chama esta rota para TODO usuário logado, e
  // leitura é liberada fora do expediente (Q1). Com `agent` aqui, o `viewer` e a sessão de suporte
  // somente-leitura (que vira `viewer`) levavam 403 a cada carga de tela — e cada 403 por papel grava
  // uma linha `authz.denied` em `api_audit_log` (medido: 3 linhas em ~70 s com o inbox aberto). O dado
  // é o horário da PRÓPRIA organização, que o usuário já enxerga na faixa.
  const authz = await requireRole("viewer", { requestId, resource: "settings_expediente" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const settings = (data?.settings as Record<string, unknown> | null) ?? {};
  return ok(descreverExpediente(settings.business_hours, new Date()), { requestId });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = requestIdDe(req);
  const authz = await requireRole("admin", { requestId, resource: "settings_expediente" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;

  let input;
  try {
    input = await validateRequest(expedienteConfigSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  const admin = createAdminClient();
  const { data: orgRow, error: readErr } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", org.orgId)
    .maybeSingle();
  if (readErr) return fail("internal_error", readErr.message, 500, { requestId });

  // Merge não-destrutivo: preserva `routing`, `visibility_mode`, `branding`, `security`…
  const atual = (orgRow?.settings as Record<string, unknown> | null) ?? {};
  const { error: updErr } = await admin
    .from("organizations")
    .update({ settings: { ...atual, business_hours: input } })
    .eq("id", org.orgId);
  if (updErr) return fail("internal_error", updErr.message, 500, { requestId });

  // O cache de 30 s do `audit()` (RF-10) é descartado AQUI, antes do audit desta própria mudança, para
  // ele já ler o expediente novo. Vale só para este processo: outro processo espera o TTL (aceito).
  descartarExpedienteDoCache(org.orgId);

  void audit({
    action: "expediente.config_changed",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "organization",
    resourceId: org.orgId,
    requestId,
    // Antes e depois: é uma regra que trava o trabalho dos outros, então quem revisa o audit precisa ver
    // o que mudou e não só que mudou. `previous` é `null` na primeira configuração.
    metadata: {
      timezone: input.timezone,
      windows: input.windows.length,
      previous: atual.business_hours ?? null,
      new: input,
    },
  });

  return ok(descreverExpediente(input, new Date()), { requestId });
}
