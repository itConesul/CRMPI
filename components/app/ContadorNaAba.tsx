"use client";

import { useEffect, useSyncExternalStore } from "react";

import { zerarAvisosDeMensagem } from "@/lib/notifications/avisos-de-mensagem";
import {
  assinarNaoVistas,
  obterNaoVistas,
  tituloComContador,
  zerarNaoVistas,
} from "@/lib/notifications/contador-na-aba";

function abaEmFoco(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

/**
 * O "(3) CRM" do título da aba — e o selo do app instalado, onde o navegador o tem.
 *
 * Não renderiza nada. Três responsabilidades:
 *  1. aplica o número no título e o REAPLICA quando a navegação troca o título
 *     (o Next reescreve `document.title` a cada tela — sem o observador, o contador
 *     sumiria no primeiro clique no menu);
 *  2. zera tudo quando a pessoa volta para a aba (viu os avisos);
 *  3. publica o selo (`navigator.setAppBadge`) quando o navegador o oferece.
 */
export function ContadorNaAba(): null {
  const n = useSyncExternalStore(assinarNaoVistas, obterNaoVistas, () => 0);

  useEffect(() => {
    const aplicar = () => {
      const alvo = tituloComContador(document.title, n);
      // Só escreve quando muda: escrever dispara o observador de novo.
      if (document.title !== alvo) document.title = alvo;
    };
    aplicar();
    const observador = new MutationObserver(aplicar);
    observador.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observador.disconnect();
      // Sai limpo: sem o contador, o título volta ao que era.
      document.title = tituloComContador(document.title, 0);
    };
  }, [n]);

  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    try {
      if (n > 0) void nav.setAppBadge?.(n)?.catch(() => undefined);
      else void nav.clearAppBadge?.()?.catch(() => undefined);
    } catch {
      // sem suporte ao selo: o título já avisa
    }
  }, [n]);

  useEffect(() => {
    const aoVoltar = () => {
      if (!abaEmFoco()) return;
      zerarNaoVistas();
      zerarAvisosDeMensagem();
    };
    window.addEventListener("focus", aoVoltar);
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.removeEventListener("focus", aoVoltar);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, []);

  return null;
}
