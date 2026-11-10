import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/messages — envia mensagem outbound (handler em ./_handler.ts).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { sendMessageSchema, validateRequest, type SendMessageInput } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

import { envioUnico } from "@/lib/messaging/envio-unico";
import { armazemDeProducao } from "@/lib/messaging/envio-unico-armazem";

import { sendMessageHandler } from "./_handler";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const supabase = await createClient();

  // spec 13 §4: escrita é agent+ (viewer é read-only).
  const authz = await requireRole("agent", { requestId, resource: "messages" });
  if (!authz.ok) return authz.response;
  const user = authz.user;
  const activeOrg = authz.org;

  let input;
  try {
    input = await validateRequest(sendMessageSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  try {
    const dados = input as SendMessageInput;
    // O mesmo envio não sai duas vezes (Idempotency-Key + janela anti-duplo-envio).
    // Ver lib/messaging/envio-unico.ts.
    const { replay, message } = await envioUnico(
      {
        organizationId: activeOrg.orgId,
        userId: user.id,
        conversationId: dados.conversation_id,
        type: dados.type ?? "text",
        body: dados.body,
        idempotencyKey: req.headers.get("Idempotency-Key"),
      },
      armazemDeProducao(),
      () =>
        sendMessageHandler(
          supabase,
          {
            organization_id: activeOrg.orgId,
            actor: { type: "user", id: user.id },
            requestId,
            idioma: user.idioma,
          },
          dados,
        ),
      async (id) => {
        const { data } = await supabase
          .from("messages")
          .select("*")
          .eq("id", id)
          .eq("organization_id", activeOrg.orgId)
          .maybeSingle();
        return (data as unknown as Awaited<ReturnType<typeof sendMessageHandler>> | null) ?? null;
      },
      { requestId },
    );
    if (replay) {
      const res = ok(message, { status: 200, requestId });
      res.headers.set("Idempotent-Replay", "true");
      return res;
    }
    return ok(message, { status: 201, requestId });
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, { requestId });
    }
    throw err;
  }
}
