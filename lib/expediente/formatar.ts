/**
 * Como o expediente é DITO a quem o lê (faixa do shell e página "fora de expediente").
 *
 * Funções puras, sem DOM: o texto que o atendente lê é o que decide se ele entende por que a tela
 * está travada, então é o que se testa. A janela é mostrada COMO O ADMIN A ESCREVEU, inclusive a que
 * vira o dia (`22:00–06:00`) — nunca reescrita em duas metades.
 */
import type { ExpedienteWindow } from "@/lib/schemas/routing";

/** Dias da semana, domingo = 0 (o mesmo `dow` do schema). Abreviados, no padrão da agenda. */
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

export type Traduzir = (texto: string) => string;
const mesmo: Traduzir = (t) => t;

/** "seg", "seg a sex", "seg, qua e sex" — agrupa dias consecutivos para a frase não virar uma lista. */
function nomesDosDias(dias: number[], t: Traduzir): string {
  const ordenados = [...new Set(dias)].sort((a, b) => a - b);
  // Semana de segunda a domingo: o domingo (0) vai para o fim, senão "dom a sex" lê errado.
  const naSemana = ordenados.map((d) => (d === 0 ? 7 : d)).sort((a, b) => a - b);
  const blocos: number[][] = [];
  for (const d of naSemana) {
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && d === ultimo[ultimo.length - 1]! + 1) ultimo.push(d);
    else blocos.push([d]);
  }
  const nome = (d: number) => t(DIAS[d % 7]!);
  const partes = blocos.map((b) =>
    b.length >= 3 ? `${nome(b[0]!)} ${t("a")} ${nome(b[b.length - 1]!)}` : b.map(nome).join(", "),
  );
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} ${t("e")} ${partes[partes.length - 1]}`;
}

/**
 * `[{seg..sex 08:00–18:00}]` → `["seg a sex, 08:00–18:00"]`.
 *
 * Dias com a MESMA janela entram numa frase só; janelas diferentes viram frases separadas, na ordem
 * em que o primeiro dia de cada uma aparece na semana. Lista vazia ⇒ `[]` (não há expediente).
 */
export function descreverJanelas(
  windows: readonly Pick<ExpedienteWindow, "dow" | "start" | "end">[],
  t: Traduzir = mesmo,
): string[] {
  const porHorario = new Map<string, number[]>();
  for (const w of windows) {
    const chave = `${w.start}–${w.end}`;
    porHorario.set(chave, [...(porHorario.get(chave) ?? []), w.dow]);
  }
  const frases = [...porHorario.entries()].map(([horario, dias]) => ({
    primeiro: Math.min(...dias.map((d) => (d === 0 ? 7 : d))),
    texto: `${nomesDosDias(dias, t)}, ${horario}`,
  }));
  return frases.sort((a, b) => a.primeiro - b.primeiro).map((f) => f.texto);
}

/**
 * "hoje às 08:00", "amanhã às 08:00" ou "ter, 08:00" — a próxima abertura NO FUSO DO EXPEDIENTE,
 * que é o relógio que a empresa usa (e não o do navegador de quem lê).
 */
export function descreverAbertura(
  abreEm: string | null | undefined,
  agora: string,
  timezone: string,
  t: Traduzir = mesmo,
): string | null {
  if (!abreEm) return null;
  const alvo = new Date(abreEm);
  const base = new Date(agora);
  if (Number.isNaN(alvo.getTime()) || Number.isNaN(base.getTime())) return null;

  const partes = (d: Date) => {
    const f = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(d);
    const v = (tipo: string) => f.find((p) => p.type === tipo)?.value ?? "";
    return { dia: `${v("year")}-${v("month")}-${v("day")}`, hora: `${v("hour")}:${v("minute")}` };
  };
  const a = partes(alvo);
  const b = partes(base);
  if (a.dia === b.dia) return `${t("hoje às")} ${a.hora}`;

  const amanha = new Date(base.getTime() + 24 * 3_600_000);
  if (a.dia === partes(amanha).dia) return `${t("amanhã às")} ${a.hora}`;

  const { dow } = (() => {
    const w = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(alvo);
    return { dow: ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[w] ?? 0 };
  })();
  return `${t(DIAS[dow]!)}, ${a.hora}`;
}
