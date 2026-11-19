/**
 * O expediente como a tela e o e2e o leem, com o estado avaliado AGORA pelo servidor.
 *
 * Fica fora do `route.ts` porque o Next só aceita handlers e configuração exportados de uma rota.
 */
import { localMoment } from "@/lib/routing/eligibility";

import { dentroDoExpediente, lerExpediente, proximaAbertura } from "./expediente";

const FUSO_PADRAO = "America/Sao_Paulo";

export function descreverExpediente(bruto: unknown, agora: Date) {
  const config = lerExpediente(bruto);
  const configurado = bruto !== undefined && bruto !== null;
  const fuso = config?.timezone ?? FUSO_PADRAO;
  const { dow, hhmm } = localMoment(agora, fuso);
  const abre = proximaAbertura(config, agora);
  return {
    business_hours: config,
    configurado,
    /** Há algo gravado, mas não é um expediente válido — a leitura o trata como "sem expediente". */
    invalido: configurado && config === null,
    /** `true` quando há janelas: só então o expediente restringe alguém. */
    restringe: config !== null && config.windows.length > 0,
    dentro: dentroDoExpediente(config, agora),
    opens_at: abre ? abre.toISOString() : null,
    agora: { iso: agora.toISOString(), timezone: fuso, dow, hhmm },
  };
}

export type ExpedienteDescrito = ReturnType<typeof descreverExpediente>;
