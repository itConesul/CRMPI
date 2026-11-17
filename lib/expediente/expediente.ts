/**
 * Expediente da organização (PRD-01, #67) — regra PURA, sem banco e sem relógio implícito.
 *
 * O expediente é a janela em que o papel `agent` pode AGIR (assumir, responder, receber
 * distribuição). Fora dela ele ainda LÊ — a decisão de produto (#67, 2026-11-13) é "bloqueia ação,
 * não leitura". `admin` e `manager` nunca são barrados, mas o que fazem fora do expediente é
 * auditado (RF-10).
 *
 * Fonte: `organizations.settings.business_hours`, no mesmo formato do horário por atendente
 * (`{ timezone, windows }`), com virada de dia (`22:00–06:00`). Ver `lib/schemas/routing.ts`.
 *
 * ## Falha ABERTA
 * Configuração ausente, fuso que o `Intl` não conhece ou shape torto = SEM expediente. Uma
 * configuração quebrada não pode trancar a equipe fora do próprio sistema — o mesmo princípio de
 * `lib/agent-engine/agent/janela-de-atendimento.ts`. `windows` vazio também é "sem restrição":
 * janela existe para RESTRINGIR.
 */
import { isWithinSchedule, localMoment } from "@/lib/routing/eligibility";
import { expedienteConfigSchema, type ExpedienteConfig } from "@/lib/schemas/routing";
import type { Role } from "@/lib/auth/types";

/**
 * Lê o que veio do banco. NUNCA lança: o que não é um expediente válido vira `null` (= sem
 * expediente), e `null` é o que `dentroDoExpediente` trata como "sempre dentro".
 */
export function lerExpediente(bruto: unknown): ExpedienteConfig | null {
  if (bruto === null || bruto === undefined) return null;
  const lido = expedienteConfigSchema.safeParse(bruto);
  return lido.success ? lido.data : null;
}

/** `agora` cai dentro do expediente? Sem expediente configurado (ou torto) ⇒ sempre `true`. */
export function dentroDoExpediente(
  config: ExpedienteConfig | null | undefined,
  agora: Date,
): boolean {
  if (!config) return true;
  return isWithinSchedule(config, agora, { viradaDeDia: true });
}

function emMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * Quando o expediente abre de novo, a partir de `agora` (só faz sentido FORA dele).
 *
 * Devolve `null` quando já está dentro, quando não há expediente e quando nenhuma janela existe.
 * É uma informação para a pessoa (a faixa e o `details.opens_at` do 403), não uma garantia
 * contábil: o cálculo soma minutos corridos, então numa virada de horário de verão o resultado
 * pode errar por 1 h — o fuso do Brasil não tem horário de verão, e o erro é só de exibição.
 */
export function proximaAbertura(
  config: ExpedienteConfig | null | undefined,
  agora: Date,
): Date | null {
  if (!config || config.windows.length === 0) return null;
  if (dentroDoExpediente(config, agora)) return null;

  const { dow, hhmm } = localMoment(agora, config.timezone);
  const agoraEmMinutos = emMinutos(hhmm);
  let menorDelta: number | null = null;

  // Hoje (d = 0) até daqui a 7 dias (d = 7, o mesmo dia da semana): cobre qualquer janela.
  for (let d = 0; d <= 7; d++) {
    const dowDoDia = (dow + d) % 7;
    for (const w of config.windows) {
      if (w.dow !== dowDoDia) continue;
      const inicio = emMinutos(w.start);
      if (d === 0 && inicio <= agoraEmMinutos) continue; // já passou hoje
      const delta = d * 1440 + inicio - agoraEmMinutos;
      if (menorDelta === null || delta < menorDelta) menorDelta = delta;
    }
  }
  if (menorDelta === null) return null;
  const inicioDoMinuto = Math.floor(agora.getTime() / 60_000) * 60_000;
  return new Date(inicioDoMinuto + menorDelta * 60_000);
}

export interface ExpedienteDecisao {
  /** `true` = a AÇÃO é barrada (`403 OUT_OF_WORK_HOURS`). Só o `agent`, só fora do expediente. */
  barrado: boolean;
  /** `true` = `agora` está fora do expediente (independe de papel e de isenção). */
  foraDoExpediente: boolean;
  /**
   * `true` = `admin`/`manager` agiu fora do expediente: passa, mas a mutação é auditada com
   * `metadata.fora_do_expediente = true` (RF-10). Nunca vira linha nova de audit.
   */
  bypassAuditado: boolean;
  /** Próxima abertura, quando fora do expediente e calculável. */
  abreEm: Date | null;
}

/**
 * A decisão do gate para UMA ação. `isenta` é a rota que declarou isenção com motivo escrito
 * (fail-closed: quem não declara, é barrada). Platform admin e sessão de suporte são tratados por
 * quem chama, que passa `papel = "admin"`/isenta — esta função só conhece papel e relógio.
 */
export function expedienteBarra(input: {
  papel: Role;
  config: ExpedienteConfig | null | undefined;
  agora: Date;
  isenta?: boolean;
}): ExpedienteDecisao {
  const fora = !dentroDoExpediente(input.config, input.agora);
  const abreEm = fora ? proximaAbertura(input.config, input.agora) : null;
  return {
    barrado: fora && input.papel === "agent" && !input.isenta,
    foraDoExpediente: fora,
    bypassAuditado: fora && (input.papel === "manager" || input.papel === "admin"),
    abreEm,
  };
}
