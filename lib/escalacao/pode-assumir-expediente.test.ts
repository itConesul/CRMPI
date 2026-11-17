import { describe, expect, it } from "vitest";

import { isAttendantEligible } from "@/lib/routing/eligibility";
import { availabilityScheduleSchema, expedienteConfigSchema } from "@/lib/schemas/routing";

import { podeAssumirAgora, type AtendenteDoRoster } from "./atendentes";

/**
 * A IA promete "um atendente vai assumir" com base em `podeAssumirAgora`; o roteamento escolhe com
 * `isAttendantEligible`. Duas portas, UMA régua (comentário de `atendentes.ts`): se divergirem, o
 * cliente ouve uma promessa que ninguém cumpre. O expediente (PRD-01 / #67) entra nas duas.
 */
const SEG_14H = new Date("2026-07-13T14:00:00-03:00");
const SEG_22H = new Date("2026-07-13T22:00:00-03:00");

const comercial = expedienteConfigSchema.parse({
  timezone: "America/Sao_Paulo",
  windows: [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "08:00", end: "18:00" })),
});

const atendente: AtendenteDoRoster = {
  userId: "u1",
  papel: "agent",
  disponivel: true,
  capacidade: 5,
  agenda: { timezone: "America/Sao_Paulo", windows: [] },
  ultimoSinalDeVida: null,
  atualizadoEm: null,
  cargaAtual: 1,
};

describe("podeAssumirAgora x expediente", () => {
  it("dentro do expediente pode assumir; fora, não", () => {
    expect(podeAssumirAgora(atendente, SEG_14H, comercial)).toBe(true);
    expect(podeAssumirAgora(atendente, SEG_22H, comercial)).toBe(false);
  });

  it("REGRESSÃO — sem o argumento (todo chamador antigo) o resultado é o de antes", () => {
    expect(podeAssumirAgora(atendente, SEG_22H)).toBe(true);
    expect(podeAssumirAgora(atendente, SEG_22H, null)).toBe(true);
  });

  it("concorda com `isAttendantEligible` nas 24 horas de uma segunda (uma régua, duas portas)", () => {
    for (let h = 0; h < 24; h++) {
      const agora = new Date(`2026-07-13T${String(h).padStart(2, "0")}:30:00-03:00`);
      const roteamento = isAttendantEligible(
        {
          isAvailable: atendente.disponivel,
          capacity: atendente.capacidade!,
          currentLoad: atendente.cargaAtual,
          schedule: availabilityScheduleSchema.parse(atendente.agenda),
          expediente: comercial,
        },
        agora,
      );
      expect(podeAssumirAgora(atendente, agora, comercial), `às ${h}:30`).toBe(roteamento);
    }
  });

  it("quem nunca configurou disponibilidade (capacidade null) segue fora, com ou sem expediente", () => {
    const semConfig = { ...atendente, capacidade: null };
    expect(podeAssumirAgora(semConfig, SEG_14H, comercial)).toBe(false);
    expect(podeAssumirAgora(semConfig, SEG_14H)).toBe(false);
  });
});
