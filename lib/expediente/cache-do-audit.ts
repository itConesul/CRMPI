/**
 * Cache do expediente DO `audit()` (PRD-01 / #67, T2c, RF-10, `02-design.md` §2.1, regra 3).
 *
 * O `audit()` roda em TODA mutação auditada (~315 chamadas), então perguntar o expediente ao banco a
 * cada uma custaria um SELECT por mutação. Aqui a leitura ganha um cache por organização, TTL de 30 s,
 * em memória do processo, descartado quando `PATCH /settings/expediente` roda no mesmo processo.
 *
 * **O cache é só do `audit()`, e NÃO fica dentro de `carregarExpediente`.** O gate e
 * `loadEligibleAttendants` usam esse carregador e leem direto no banco, sem cache, por decisão do dono
 * (#110, 2026-11-24): o expediente que a gerente salva vale na hora para quem barra e para quem recebe
 * conversa. O atraso de até 30 s aceito pelo dono vale só para a MARCA de auditoria. Por isso esta
 * função ENVOLVE o carregador, e o carregador não muda.
 *
 * Aceito, por escrito: outro processo (o worker, outra instância) só enxerga a mudança quando o TTL
 * vence, e a ação iniciada no fim do expediente e auditada logo depois sai marcada (o relógio é o do
 * `audit()`, não o do gate).
 *
 * Também guarda o SINAL AGREGADO da falha da marca (review do #87, item 4): só o `warn` por falha não
 * basta, porque se a leitura falhar sempre a marca nunca sai e ninguém percebe. Emite UM aviso por
 * organização, por dia, por processo; o ruído não cresce com o tráfego.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import type { ExpedienteConfig } from "@/lib/schemas/routing";

import { carregarExpediente } from "./carregar";

export const TTL_DO_CACHE_DO_AUDIT_MS = 30_000;

interface Entrada {
  config: ExpedienteConfig | null;
  venceEm: number;
}

interface Estado {
  cache: Map<string, Entrada>;
  falhas: Map<string, number>;
}

/**
 * O estado vive em `globalThis`, UM por processo, e NÃO num `Map` do escopo do módulo.
 *
 * No Next de produção as rotas de API e as Server Actions ficam em grafos de módulos diferentes, e cada
 * um carrega a PRÓPRIA cópia deste arquivo. Com `const cache = new Map()` aqui, o `PATCH
 * /settings/expediente` descartava só o cache da rota, e a Server Action seguia com o expediente antigo
 * pelo resto dos 30 s: medido no e2e (2026-11-24), a linha `org.updated` de uma Server Action, 0,7 s
 * depois de a rota mudar o expediente para "dentro", ainda saiu marcada como "fora". `Symbol.for` dá a
 * mesma chave a todas as cópias. Vigiado por `cache-do-audit.instancias.test.ts`.
 */
const CHAVE_DO_ESTADO = Symbol.for("deskcomm.expediente.cache-do-audit");
const global = globalThis as unknown as Record<symbol, Estado | undefined>;
const estado: Estado = (global[CHAVE_DO_ESTADO] ??= { cache: new Map(), falhas: new Map() });
const { cache, falhas } = estado;

/**
 * O expediente da organização, do cache se ainda valer. **`null` também é cacheado** ("sem expediente",
 * o estado de toda instalação que não o configurou): sem isso cada mutação pagaria um SELECT justamente
 * onde nada pode ser marcado. Uma leitura que falhou também vira `null` por 30 s: perder a marca nesse
 * intervalo é o aceito ("falha só perde o campo"), e o `carregarExpediente` já registrou o `warn`.
 */
export async function expedienteParaAudit(
  db: SupabaseClient,
  organizationId: string,
  agora: number = Date.now(),
): Promise<ExpedienteConfig | null> {
  const guardado = cache.get(organizationId);
  if (guardado && guardado.venceEm > agora) return guardado.config;
  const config = await carregarExpediente(db, organizationId);
  cache.set(organizationId, { config, venceEm: agora + TTL_DO_CACHE_DO_AUDIT_MS });
  return config;
}

/** Descarta a entrada da organização: `PATCH /settings/expediente` chama isto depois de gravar. */
export function descartarExpedienteDoCache(organizationId: string): void {
  cache.delete(organizationId);
}

/**
 * Registra que a decisão da marca FALHOU (a leitura do expediente, o papel ou a sessão). Nunca lança.
 * Devolve `true` quando emitiu o aviso agregado (a primeira falha da organização no dia, neste processo).
 */
export function registrarFalhaDaMarca(organizationId: string, erro: unknown, agora: Date = new Date()): boolean {
  const chave = `${organizationId}:${agora.toISOString().slice(0, 10)}`;
  const total = (falhas.get(chave) ?? 0) + 1;
  falhas.set(chave, total);
  logger.warn("[expediente] a marca fora_do_expediente falhou; a linha de audit segue sem o campo", {
    organization_id: organizationId,
    error: erro instanceof Error ? erro.message : String(erro),
  });
  if (total !== 1) return false;
  logger.warn("[expediente] a marca do RF-10 está falhando nesta organização hoje (aviso único por organização, dia e processo)", {
    organization_id: organizationId,
    dia: chave.split(":")[1],
  });
  return true;
}

/** Só para teste: quantas falhas a organização acumulou no dia deste processo. */
export function falhasDaMarcaNoDia(organizationId: string, agora: Date = new Date()): number {
  return falhas.get(`${organizationId}:${agora.toISOString().slice(0, 10)}`) ?? 0;
}

/** Só para teste: esvazia o cache e o contador de falhas. */
export function __limparCacheDoAuditParaTeste(): void {
  cache.clear();
  falhas.clear();
}
