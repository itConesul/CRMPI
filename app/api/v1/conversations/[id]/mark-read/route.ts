import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/conversations/[id]/mark-read — zera unread_count_for_assignee.
 *
 * Disparado pelo inbox após 1,5s com a conversa em foco (EPIC-03 S-03.10).
 * RLS garante que só conversas visíveis ao ator são atualizadas.
 */
import { type NextRequest } from "next/server";

import { requestIdDe } from "@/lib/api/request-id";
import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

import { markConversationReadHandler } from "../../_handler";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = requestIdDe(_req);
  const { id } = await ctx.params;
  const supabase = await createClient();

  const authz = await requireRole("agent", {
    requestId,
    resource: "conversations",
    // PRD-01 (#67), decisão P1: o inbox dispara esta rota sozinho ao abrir a conversa. Barrá-la fora
    // do expediente daria 403 a todo `agent` que só lê (que a Q1/RF-4 liberam) e o contador de não
    // lidas nunca zeraria. Não fala com o cliente nem assume atendimento.
    expediente: { isenta: "ação automática da UI, sem efeito para o cliente" },
  });
  if (!authz.ok) return authz.response;

  try {
    const conv = await markConversationReadHandler(
      supabase,
      {
        organization_id: authz.org.orgId,
        actor: { type: "user", id: authz.user.id },
        requestId,
        idioma: authz.user.idioma,
      },
      id,
    );
    return ok(conv, { requestId });
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, { requestId });
    }
    throw err;
  }
}
