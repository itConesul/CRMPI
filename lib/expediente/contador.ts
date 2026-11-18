/**
 * Contador agregado de tentativas barradas pelo expediente (PRD-01 / #67, RNF-5 e N4).
 *
 * A tentativa barrada NÃO grava linha em `api_audit_log`: retry e polling da UI inflariam o log como
 * as rodadas de cron vazias inflaram (CLAUDE.md, "auditar quando houve efeito"). Em vez disso conta-se
 * `expediente:barrados:<organization_id>:<AAAA-MM-DD no fuso da organização>` (`INCR` + validade de
 * 48 h) no mesmo Redis que o app já exige — sem env nova.
 *
 * **Contar nunca decide nada.** Redis ausente, malformado ou fora do ar ⇒ não conta e segue: a
 * requisição já foi barrada por quem chamou, e a leitura devolve `null` (a tela mostra `—`). Nenhuma
 * função daqui lança.
 */
import { Redis } from "@upstash/redis";

import { logger } from "@/lib/logger";
import { validarConfigRedisRest } from "@/lib/redis-config";

const VALIDADE_SEGUNDOS = 48 * 60 * 60;

let _redis: Redis | null | undefined;

function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!validarConfigRedisRest(url, token).ok) {
    _redis = null;
    return null;
  }
  // `retry: false`: Redis inalcançável não pode somar latência à resposta de um 403.
  _redis = new Redis({ url: url!, token: token!, retry: false });
  return _redis;
}

/** Só para teste: descarta o cliente guardado para que a próxima chamada releia o ambiente. */
export function __reiniciarContadorParaTeste(): void {
  _redis = undefined;
}

/** `AAAA-MM-DD` de `agora` no fuso da organização; fuso desconhecido cai para UTC. */
export function diaNoFuso(agora: Date, timezone: string): string {
  const formatar = (tz: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(agora);
  try {
    return formatar(timezone);
  } catch {
    return formatar("UTC");
  }
}

export function chaveDoContador(organizationId: string, agora: Date, timezone: string): string {
  return `expediente:barrados:${organizationId}:${diaNoFuso(agora, timezone)}`;
}

/** Conta UMA tentativa barrada. Devolve `true` se contou. Nunca lança. */
export async function contarBarrado(
  organizationId: string,
  timezone: string,
  agora: Date = new Date(),
): Promise<boolean> {
  const cliente = redis();
  if (!cliente) return false;
  try {
    const chave = chaveDoContador(organizationId, agora, timezone);
    const total = await cliente.incr(chave);
    // A validade só é posta na primeira contagem do dia: reaplicar a cada tentativa empurraria a
    // expiração para sempre num dia de rajada.
    if (total === 1) await cliente.expire(chave, VALIDADE_SEGUNDOS);
    return true;
  } catch (err) {
    logger.warn("[expediente] contador de barrados indisponível; a tentativa foi barrada do mesmo jeito", {
      organization_id: organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/** Quantas tentativas foram barradas hoje, ou `null` quando o Redis não responde (a tela mostra `—`). */
export async function lerBarradosDoDia(
  organizationId: string,
  timezone: string,
  agora: Date = new Date(),
): Promise<number | null> {
  const cliente = redis();
  if (!cliente) return null;
  try {
    const valor = await cliente.get<number | string>(chaveDoContador(organizationId, agora, timezone));
    return valor == null ? 0 : Number(valor);
  } catch {
    return null;
  }
}
