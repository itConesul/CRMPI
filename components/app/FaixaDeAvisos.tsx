"use client";

import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { useNotificationPermission } from "@/hooks/notifications/useNotificationPermission";
import { useT } from "@/hooks/i18n/useT";
import { estadoDaFaixa } from "@/lib/notifications/estado-da-faixa";

const CHAVE = "alerts.banner.dismissed";

function lerDispensada(): boolean {
  try {
    return window.localStorage.getItem(CHAVE) === "1";
  } catch {
    return false;
  }
}

/**
 * A faixa que pede (ou explica) os avisos do sistema, como o WhatsApp Web.
 *
 * Antes a permissão só podia ser pedida em Configurações › Notificações, e quem
 * não ia lá nunca via uma notificação. Aqui o pedido aparece onde a pessoa já está
 * — e só quando adianta pedir: em `http://` fora de `localhost` o navegador
 * bloqueia notificação e Service Worker, e um botão "Ativar" ali seria uma
 * promessa que não se cumpre; a faixa diz o motivo.
 *
 * Renderiza só no cliente depois de montar: contexto seguro e permissão são fatos
 * do navegador, e chutá-los no servidor faria a faixa piscar para quem já tem tudo.
 */
export function FaixaDeAvisos() {
  const t = useT();
  const { permission, request } = useNotificationPermission();
  // `false` no servidor e na hidratação, `true` no cliente: a faixa só aparece depois
  // de montar, sem efeito que dispare outra renderização.
  const montado = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const [dispensada, setDispensada] = useState(() =>
    typeof window === "undefined" ? true : lerDispensada(),
  );

  if (!montado) return null;

  const estado = estadoDaFaixa({
    contextoSeguro: window.isSecureContext,
    permissao: permission,
    dispensada,
  });
  if (estado === "nenhuma") return null;

  const dispensar = () => {
    try {
      window.localStorage.setItem(CHAVE, "1");
    } catch {
      // sem armazenamento: some só nesta visita
    }
    setDispensada(true);
  };

  const texto =
    estado === "pedir"
      ? t("Ative os avisos para ser notificado de novas mensagens, mesmo com esta aba em segundo plano.")
      : estado === "bloqueado"
        ? t("Os avisos estão bloqueados neste navegador. Libere as notificações nas configurações do site (o cadeado ao lado do endereço).")
        : t("Os avisos do sistema só funcionam em HTTPS ou em localhost. Neste endereço o navegador os bloqueia; o contador na aba e os avisos na tela continuam funcionando.");

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 border-b bg-muted/60 px-6 py-2 text-sm"
      data-testid="faixa-de-avisos"
      data-estado={estado}
    >
      <p className="min-w-0 flex-1">{texto}</p>
      {estado === "pedir" && (
        <Button size="sm" onClick={() => void request()}>
          {t("Ativar avisos")}
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={dispensar}>
        {t("Agora não")}
      </Button>
    </div>
  );
}
