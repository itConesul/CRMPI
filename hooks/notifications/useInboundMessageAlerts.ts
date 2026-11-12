"use client";

import { useCallback, useEffect } from "react";

import { useActiveOrg } from "@/hooks/auth/AuthProvider";
import { getOpenConversationId } from "@/hooks/notifications/OpenConversationContext";
import { useRealtimeChannel } from "@/hooks/realtime/useRealtimeChannel";
import { avisarMensagem, zerarAvisosDaConversa } from "@/lib/notifications/avisos-de-mensagem";
import { somarNaoVistas } from "@/lib/notifications/contador-na-aba";
import { shouldNotifyInbound } from "@/lib/notifications/policy";
import { syncPushSubscription } from "@/lib/notifications/push_client";
import { createClient } from "@/lib/supabase/browser";

// A leitura de nome e foto mora em `lib/notifications/contato-do-aviso.ts`; o nome
// continua exportado daqui porque é por aqui que os testes e o resto o importam.
export { contactNotifyBits } from "@/lib/notifications/contato-do-aviso";

function tabFocused(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "visible" && document.hasFocus();
}

/** postgres_changes entrega `{ new }`; alguns mocks aninham em `payload`. */
function rowFromRealtime(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as {
    tipo?: unknown;
    new?: unknown;
    record?: unknown;
    payload?: { new?: unknown };
  };
  if (p.tipo === "reassinado") return null;
  const raw = p.new ?? p.record ?? p.payload?.new;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function previewFromMessage(row: { type?: unknown; body?: unknown }): string {
  if (row.type !== "text") return "Mídia";
  const body = typeof row.body === "string" ? row.body.trim() : "";
  return body || "Nova mensagem";
}

async function contactIdFromRow(
  row: Record<string, unknown>,
  conversationId: string | null,
): Promise<string | null> {
  if (typeof row.contact_id === "string") return row.contact_id;
  if (!conversationId) return null;
  const supabase = createClient();
  const { data } = await supabase
    .from("conversations")
    .select("contact_id")
    .eq("id", conversationId)
    .maybeSingle();
  const c = data as { contact_id?: string | null } | null;
  return typeof c?.contact_id === "string" ? c.contact_id : null;
}

export function useInboundMessageAlerts(): void {
  const orgId = useActiveOrg()?.orgId ?? null;

  useEffect(() => {
    if (!orgId) return;
    void syncPushSubscription();
  }, [orgId]);

  const onChange = useCallback((payload: unknown) => {
    const row = rowFromRealtime(payload);
    if (!row) return;
    const conversationId = typeof row.conversation_id === "string" ? row.conversation_id : null;
    const direction = typeof row.direction === "string" ? row.direction : null;
    if (
      !shouldNotifyInbound({
        direction,
        conversationId,
        openConversationId: getOpenConversationId(),
        tabFocused: tabFocused(),
        tipo: (payload as { tipo?: unknown }).tipo,
        historica: row.is_historical === true,
      })
    ) {
      // O atendente está olhando esta conversa: o que estava acumulado dela foi visto.
      if (
        direction === "inbound" &&
        conversationId &&
        getOpenConversationId() === conversationId &&
        tabFocused()
      ) {
        zerarAvisosDaConversa(conversationId);
      }
      return;
    }
    // `shouldNotifyInbound` só devolve true com `conversationId`; o guarda é do tipo.
    if (!conversationId) return;
    // Fora da aba, a mensagem entra no contador do título ("(3) CRM").
    if (!tabFocused()) somarNaoVistas();
    void (async () => {
      const contactId = await contactIdFromRow(row, conversationId);
      // Quem decide se sai agora, se vira "N novas mensagens" e se entra no resumo
      // de uma rajada é o agrupador — o hook só avisa que chegou.
      avisarMensagem({ conversationId, contactId, preview: previewFromMessage(row) });
    })();
  }, []);

  useRealtimeChannel({
    name: orgId ? `alerts-messages-${orgId}` : "alerts-messages-disabled",
    postgresChanges: orgId
      ? {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `organization_id=eq.${orgId}`,
        }
      : undefined,
    onChange,
    enabled: !!orgId,
  });
}
