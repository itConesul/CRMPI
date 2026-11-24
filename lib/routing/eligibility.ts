/**
 * Elegibilidade de atendente para roteamento (spec 13 §5).
 *
 * Elegível = disponível ∧ dentro do horário (schedule tz-aware) ∧ abaixo da
 * capacidade. Lógica PURA e testável — o worker de G5-02 (cron TS) importa daqui
 * e passa o `now` + a carga atual (conversas abertas atribuídas). Sem acesso a
 * DB, sem relógio implícito: o `now` é sempre injetado (teste usa clock mockado).
 *
 * AT-08: o auto-offline por heartbeat velho vive aqui como constante NOMEADA
 * única (não espalhada como número mágico) e como predicado testável; o cron
 * `/api/v1/cron/attendant-heartbeat` faz o UPDATE a partir do cutoff.
 */
import type { AvailabilitySchedule } from "@/lib/schemas/routing";

/** AT-08: atendente sem heartbeat há mais que isto ⇒ auto-offline (config, não mágica). */
export const HEARTBEAT_TIMEOUT_MINUTES = 15;

/**
 * Status de conversa que contam como "carga" do atendente (aberta atribuída);
 * resolved/closed/archived não. Fonte única: o worker de roteamento (elegibilidade
 * por capacidade) e o painel de atendimento (carga exibida) leem daqui — o número
 * que o manager vê é o mesmo que o router usa.
 */
export const OPEN_LOAD_STATUSES = ["open", "pending", "claimed", "ai_handling"] as const;

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Momento local (dow 0-6 + "HH:MM") de `now` no timezone dado. tz-aware via
 * Intl (stdlib, sem dependência) — respeita DST do fuso.
 *
 * EXPORTADA porque a agenda (`lib/agenda/fuso.ts`) faz a MESMA pergunta — em que
 * dia da semana cai este instante, no fuso da jornada — e escrever uma segunda
 * versão dela seria a duplicação que já custou um bug de fuso a esta base. O
 * corpo não mudou; só deixou de ser privado ao módulo.
 */
export function localMoment(now: Date, timezone: string): { dow: number; hhmm: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const dow = WEEKDAY_INDEX[get("weekday")] ?? 0;
  const hhmm = `${get("hour")}:${get("minute")}`;
  return { dow, hhmm };
}

/** Uma janela: `dow` 0=domingo … 6=sábado, "HH:MM" de início e de fim (fim exclusivo). */
export interface JanelaDeHorario {
  dow: number;
  start: string;
  end: string;
}

/**
 * O momento local (`dow` + "HH:MM") cai nesta janela? — a ÚNICA implementação dessa pergunta.
 *
 * Janela comum (`start < end`): `dow` igual e `start <= hhmm < end`.
 *
 * Janela que VIRA o dia (`end < start`, ex.: 22:00–06:00), só com `viradaDeDia: true`: pertence ao
 * `dow` em que COMEÇA — vale a parte da noite nesse dia (`hhmm >= start`) e a madrugada do dia
 * SEGUINTE (`hhmm < end`, `dow + 1` módulo 7, então sábado → domingo). `end = "00:00"` é a
 * meia-noite: `08:00–00:00` vai até o fim do dia.
 *
 * Com `viradaDeDia` desligado (o padrão) uma janela com `end < start` **nunca contém nada**, que é
 * exatamente o que esta função sempre fez: o horário por atendente e a agenda não mudam.
 */
export function janelaContem(
  janela: JanelaDeHorario,
  dow: number,
  hhmm: string,
  viradaDeDia = false,
): boolean {
  if (janela.start < janela.end) {
    return janela.dow === dow && hhmm >= janela.start && hhmm < janela.end;
  }
  if (!viradaDeDia || janela.start === janela.end) return false;
  return (
    (janela.dow === dow && hhmm >= janela.start) ||
    ((janela.dow + 1) % 7 === dow && hhmm < janela.end)
  );
}

/**
 * `now` cai dentro de alguma janela do schedule?
 * `windows` vazio (default do DB `{}`) = sem restrição de horário ⇒ true (24/7);
 * janelas existem para RESTRINGIR, não para habilitar.
 *
 * `opts.viradaDeDia` liga o tratamento de janela que atravessa a meia-noite — só o expediente da
 * organização o liga (ver `janelaContem`).
 */
export function isWithinSchedule(
  schedule: { timezone?: string | null; windows?: readonly JanelaDeHorario[] | null } | null | undefined,
  now: Date,
  opts: { viradaDeDia?: boolean } = {},
): boolean {
  const windows = schedule?.windows ?? [];
  if (windows.length === 0) return true;
  const timezone = schedule?.timezone || "America/Sao_Paulo";
  const { dow, hhmm } = localMoment(now, timezone);
  return windows.some((w) => janelaContem(w, dow, hhmm, opts.viradaDeDia ?? false));
}

/** Heartbeat mais velho que o timeout ⇒ considerado offline (AT-08). */
export function isHeartbeatStale(
  lastHeartbeatAt: string | Date | null | undefined,
  now: Date,
  timeoutMinutes: number = HEARTBEAT_TIMEOUT_MINUTES,
): boolean {
  if (!lastHeartbeatAt) return true;
  const last = new Date(lastHeartbeatAt).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last > timeoutMinutes * 60_000;
}

export interface AttendantEligibilityInput {
  isAvailable: boolean;
  capacity: number;
  /** Conversas abertas atribuídas ao atendente (carga atual). */
  currentLoad: number;
  schedule?: Pick<AvailabilitySchedule, "timezone" | "windows"> | null;
  /**
   * Expediente da ORGANIZAÇÃO (`organizations.settings.business_hours`, PRD-01 / #67). Camada
   * somada ao horário próprio do atendente: política da empresa ∧ disponibilidade pessoal.
   *
   * **Ausente (`undefined`/`null`) = sem restrição**, então nenhum chamador existente muda de
   * comportamento até alguém configurar um expediente. Janela que vira o dia é entendida aqui.
   */
  expediente?: { timezone?: string | null; windows?: readonly JanelaDeHorario[] | null } | null;
}

/**
 * disponível ∧ com folga (carga < capacidade) ∧ dentro do horário próprio (§5) ∧ dentro do
 * expediente da organização (RF-12: fora dele o `agent` não entra na distribuição).
 */
export function isAttendantEligible(input: AttendantEligibilityInput, now: Date): boolean {
  return (
    input.isAvailable &&
    input.currentLoad < input.capacity &&
    isWithinSchedule(input.schedule ?? null, now) &&
    isWithinSchedule(input.expediente ?? null, now, { viradaDeDia: true })
  );
}
