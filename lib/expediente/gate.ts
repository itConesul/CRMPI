/**
 * O gate de expediente (PRD-01 / #67), aplicado por `requireRole`.
 *
 * Decisão de produto (#67, 2026-11-13 e 2026-11-17): fora do expediente o `agent` continua LENDO,
 * mas não AGE. O servidor recusa (`403 OUT_OF_WORK_HOURS`), não só a tela. **Fail-closed:** todo
 * método que não seja leitura é barrado por padrão, e só escapa a rota que declara
 * `expediente: { isenta: "<motivo>" }` — uma rota de escrita nova nasce barrada, e esquecer de
 * declarar não abre nada.
 */
import { headers } from "next/headers";

import { carregarExpediente } from "@/lib/expediente/carregar";
import { expedienteBarra } from "@/lib/expediente/expediente";
import { HEADER_METODO_HTTP, metodoEhEscrita } from "@/lib/expediente/metodo";
import type { Role } from "@/lib/auth/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Declaração de isenção de uma rota. O motivo é OBRIGATÓRIO e é o que um revisor lê: a lista de
 * isenções é curta de propósito, e `tests/unit/expediente-rotas-de-acao.test.ts` a fixa — adicionar
 * uma exige mudar o teste, ou seja, é uma decisão visível e não um esquecimento.
 */
export interface IsencaoDeExpediente {
  isenta: string;
}

/** O método HTTP da requisição em curso, ou `null` fora de uma (testes) ou sem o carimbo do proxy. */
export async function lerMetodoDaRequisicao(): Promise<string | null> {
  try {
    return (await headers()).get(HEADER_METODO_HTTP);
  } catch {
    return null;
  }
}

export type ResultadoDoGate =
  | { barrado: false }
  | { barrado: true; abreEm: Date | null };

/**
 * Esta ação, feita por este papel, agora, é barrada pelo expediente?
 *
 * Só o `agent` é alcançado (RF-4); `admin`/`manager` nunca são barrados (RF-6) e por isso nem
 * custam a leitura do expediente. Leitura (`GET`/`HEAD`/`OPTIONS`) nunca é barrada e também não custa.
 * Falha ABERTA: se o expediente não puder ser lido, `carregarExpediente` devolve `null` e passa.
 */
export async function avaliarGateDeExpediente(input: {
  papel: Role;
  organizationId: string;
  db: SupabaseClient;
  /** Rota que declarou isenção; o valor é o motivo escrito. */
  isencao?: IsencaoDeExpediente;
  /** Injetável para teste; o padrão é o método carimbado pelo proxy. */
  metodo?: string | null;
  agora?: Date;
}): Promise<ResultadoDoGate> {
  if (input.papel !== "agent") return { barrado: false };
  if (input.isencao?.isenta) return { barrado: false };

  const metodo = input.metodo !== undefined ? input.metodo : await lerMetodoDaRequisicao();
  if (!metodoEhEscrita(metodo)) return { barrado: false };

  const config = await carregarExpediente(input.db, input.organizationId);
  const decisao = expedienteBarra({
    papel: input.papel,
    config,
    agora: input.agora ?? new Date(),
  });
  return decisao.barrado ? { barrado: true, abreEm: decisao.abreEm } : { barrado: false };
}
