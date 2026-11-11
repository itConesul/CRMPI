/**
 * Qual faixa de avisos mostrar, e se mostra.
 *
 * Os avisos do sistema (a notificação na bandeja) dependem de DUAS coisas que a
 * pessoa não vê: a permissão do navegador e o contexto seguro. Em `http://` fora
 * de `localhost`, o Chrome entrega `Notification.permission === "denied"` e nem
 * expõe o Service Worker — medido em 2026-11-11 em `http://192.168.0.112:3000`.
 * Oferecer ali um botão "Ativar avisos" seria oferecer o que não funciona; o
 * certo é dizer por quê.
 *
 * Função pura: a decisão é o que importa e se prova sem navegador.
 */
export type EstadoDaFaixa = "nenhuma" | "inseguro" | "pedir" | "bloqueado";

export function estadoDaFaixa(entrada: {
  contextoSeguro: boolean;
  /** "unsupported" quando o navegador não tem `Notification`. */
  permissao: NotificationPermission | "unsupported";
  dispensada: boolean;
}): EstadoDaFaixa {
  if (entrada.dispensada) return "nenhuma";
  if (!entrada.contextoSeguro) return "inseguro";
  if (entrada.permissao === "unsupported" || entrada.permissao === "granted") return "nenhuma";
  if (entrada.permissao === "denied") return "bloqueado";
  return "pedir";
}
