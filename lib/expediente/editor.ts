/**
 * A lógica do EDITOR do expediente (PRD-01 / #67, T6) — pura, sem DOM.
 *
 * A tela de configuração é um formulário de janelas por dia da semana. O que decide se o admin
 * consegue montar o horário que tem na cabeça (e não um torto) mora aqui, onde se testa sem
 * navegador: a ordem da semana, a janela nova que o botão "abrir neste dia" cria, o que a tela
 * recusa antes de ir ao servidor e a comparação que liga o botão "Salvar".
 *
 * O servidor continua sendo quem valida de verdade (`expedienteConfigSchema`): o que a tela recusa
 * é um subconjunto do que ele recusa, só para o erro aparecer ao lado do campo.
 */
import { roleAtLeast } from "@/lib/auth/types";
import type { ExpedienteConfig, ExpedienteWindow } from "@/lib/schemas/routing";

/** O fuso que a tela sugere numa organização sem expediente (o mesmo de `descreverExpediente`). */
export const FUSO_PADRAO_DO_EDITOR = "America/Sao_Paulo";

/** A semana como a empresa a lê: segunda primeiro, domingo no fim. O `dow` do schema é 0 = domingo. */
export const SEMANA = [1, 2, 3, 4, 5, 6, 0] as const;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const minutos = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const paraHhmm = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Posição do dia na semana da empresa (segunda = 0 … domingo = 6), para ordenar. */
const posicaoNaSemana = (dow: number): number => SEMANA.indexOf(dow as (typeof SEMANA)[number]);

/** As janelas de um dia, na ordem em que começam. */
export function janelasDoDia(windows: readonly ExpedienteWindow[], dow: number): ExpedienteWindow[] {
  return windows.filter((w) => w.dow === dow).sort((a, b) => a.start.localeCompare(b.start));
}

/** Ordem estável de gravação: segunda a domingo e, dentro do dia, pelo começo. */
export function ordenar(windows: readonly ExpedienteWindow[]): ExpedienteWindow[] {
  return [...windows].sort(
    (a, b) => posicaoNaSemana(a.dow) - posicaoNaSemana(b.dow) || a.start.localeCompare(b.start),
  );
}

/** "Segunda a sexta, 08:00–18:00" — o ponto de partida de quem nunca configurou. */
export function semanaComercial(): ExpedienteWindow[] {
  return [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "08:00", end: "18:00" }));
}

/**
 * A janela que o botão cria. A primeira do dia é o expediente comercial (08:00–18:00); as seguintes
 * começam uma hora depois do fim da última (almoço, plantão da noite) e duram duas horas — sempre
 * dentro do mesmo dia, para a janela nova nunca nascer "virando a meia-noite" sem o admin pedir.
 */
export function novaJanelaNoDia(windows: readonly ExpedienteWindow[], dow: number): ExpedienteWindow {
  const doDia = janelasDoDia(windows, dow).filter((w) => !viraODia(w));
  const ultima = doDia[doDia.length - 1];
  if (!ultima) return { dow, start: "08:00", end: "18:00" };
  const inicio = Math.min(minutos(ultima.end) + 60, 21 * 60);
  return { dow, start: paraHhmm(inicio), end: paraHhmm(Math.min(inicio + 120, 23 * 60)) };
}

/** `end` antes de `start` é a virada de dia (22:00–06:00): a janela pertence ao dia em que COMEÇA. */
export function viraODia(w: Pick<ExpedienteWindow, "start" | "end">): boolean {
  return HHMM.test(w.start) && HHMM.test(w.end) && w.end < w.start;
}

export type ProblemaDaJanela = "vazia" | "igual";

/** O que a tela recusa numa janela antes de mandar ao servidor (que recusa o mesmo, e mais). */
export function problemaDaJanela(w: Pick<ExpedienteWindow, "start" | "end">): ProblemaDaJanela | null {
  if (!HHMM.test(w.start) || !HHMM.test(w.end)) return "vazia";
  if (w.start === w.end) return "igual";
  return null;
}

/** `Intl` lança `RangeError` num fuso que não conhece: a mesma prova que o servidor faz. */
export function fusoValido(fuso: string): boolean {
  // A tela apara o valor ao enviar, então é o valor APARADO que precisa existir.
  const limpo = fuso.trim();
  if (limpo === "" || limpo.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: limpo });
    return true;
  } catch {
    return false;
  }
}

/** Há algo que impeça de salvar? Janela sem horário, `início = fim` ou fuso que não existe. */
export function podeSalvar(rascunho: ExpedienteConfig): boolean {
  return fusoValido(rascunho.timezone) && rascunho.windows.every((w) => problemaDaJanela(w) === null);
}

/** Mesmo expediente? Ignora a ordem em que as janelas foram digitadas. */
export function mesmoExpediente(a: ExpedienteConfig, b: ExpedienteConfig): boolean {
  return JSON.stringify({ timezone: a.timezone, windows: ordenar(a.windows) }) ===
    JSON.stringify({ timezone: b.timezone, windows: ordenar(b.windows) });
}

/**
 * Quem vê o botão de salvar. Espelha a ROTA, e não a página: `PATCH /settings/expediente` é
 * `requireRole("admin")` sem `allowPlatformAdmin`, então o platform admin que é `manager` (ou `viewer`)
 * na organização leva 403 — mostrar o botão a ele seria oferecer uma ação que a rota recusa (revisão do
 * #132, ponto 4; o mesmo critério da #99: a tela espelha a rota). Só importa o papel NA organização; a
 * sessão de suporte `full` já chega aqui como `admin`.
 */
export function podeEditarOExpediente(papel: string | null | undefined): boolean {
  // O MESMO critério de `requireRole("admin")`: posto (rank) no papel da organização, não igualdade de texto.
  return roleAtLeast(papel, "admin");
}
