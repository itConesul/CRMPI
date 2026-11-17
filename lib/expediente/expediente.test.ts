import { describe, expect, it } from "vitest";

import { isWithinSchedule, janelaContem } from "@/lib/routing/eligibility";
import {
  availabilityScheduleSchema,
  expedienteConfigSchema,
  scheduleWindowSchema,
} from "@/lib/schemas/routing";

import {
  dentroDoExpediente,
  expedienteBarra,
  lerExpediente,
  proximaAbertura,
} from "./expediente";

/**
 * Expediente da organização (PRD-01, #67). O relógio é SEMPRE injetado.
 *
 * Julho de 2026, America/Sao_Paulo (UTC-03, sem horário de verão):
 *   seg 13 · ter 14 · qua 15 · qui 16 · sex 17 · sáb 18 · dom 19 · seg 20
 */
const brt = (dia: number, hhmm: string): Date => new Date(`2026-07-${dia}T${hhmm}:00-03:00`);

const SEG = 1;
const SAB = 6;
const SP = "America/Sao_Paulo";

/** Comercial: seg a sex, 08:00–18:00. */
const comercial = expedienteConfigSchema.parse({
  timezone: SP,
  windows: [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "08:00", end: "18:00" })),
});

/** Plantão: segunda 22:00 → terça 06:00. */
const plantaoSegunda = expedienteConfigSchema.parse({
  timezone: SP,
  windows: [{ dow: SEG, start: "22:00", end: "06:00" }],
});

describe("CA-1 · dentroDoExpediente (comercial 08–18)", () => {
  it("22h da segunda, com expediente 08–18, está FORA", () => {
    expect(dentroDoExpediente(comercial, brt(13, "22:00"))).toBe(false);
  });
  it("12h da segunda está DENTRO", () => {
    expect(dentroDoExpediente(comercial, brt(13, "12:00"))).toBe(true);
  });
  it("07:59 fora, 08:00 dentro, 17:59 dentro, 18:00 fora (fim exclusivo)", () => {
    expect(dentroDoExpediente(comercial, brt(13, "07:59"))).toBe(false);
    expect(dentroDoExpediente(comercial, brt(13, "08:00"))).toBe(true);
    expect(dentroDoExpediente(comercial, brt(13, "17:59"))).toBe(true);
    expect(dentroDoExpediente(comercial, brt(13, "18:00"))).toBe(false);
  });
  it("dia sem janela (sábado e domingo) está FORA, mesmo às 12h", () => {
    expect(dentroDoExpediente(comercial, brt(18, "12:00"))).toBe(false);
    expect(dentroDoExpediente(comercial, brt(19, "12:00"))).toBe(false);
  });
  it("respeita o FUSO da organização, não o do servidor", () => {
    const manaus = expedienteConfigSchema.parse({
      timezone: "America/Manaus", // UTC-04
      windows: [{ dow: SEG, start: "08:00", end: "18:00" }],
    });
    // 17:30 em Manaus == 18:30 em São Paulo.
    expect(dentroDoExpediente(manaus, new Date("2026-07-13T17:30:00-04:00"))).toBe(true);
    expect(dentroDoExpediente(comercial, new Date("2026-07-13T17:30:00-04:00"))).toBe(false);
  });
});

describe("N3 · virada de dia (22:00–06:00, a janela pertence ao dow em que COMEÇA)", () => {
  const dentro = (dia: number, hhmm: string) => dentroDoExpediente(plantaoSegunda, brt(dia, hhmm));

  it("21:59 da segunda: fora; 22:00: dentro; 23:59: dentro", () => {
    expect(dentro(13, "21:59")).toBe(false);
    expect(dentro(13, "22:00")).toBe(true);
    expect(dentro(13, "23:59")).toBe(true);
  });
  it("a madrugada da TERÇA ainda é da janela de segunda: 00:00 e 05:59 dentro, 06:00 fora", () => {
    expect(dentro(14, "00:00")).toBe(true);
    expect(dentro(14, "05:59")).toBe(true);
    expect(dentro(14, "06:00")).toBe(false);
  });
  it("a janela de um dow NÃO vaza para o dow ANTERIOR: a madrugada da segunda está fora", () => {
    expect(dentro(13, "03:00")).toBe(false);
  });
  it("sábado → domingo: a janela de sábado vale na madrugada de domingo (6 + 1 = 0)", () => {
    const plantaoSabado = expedienteConfigSchema.parse({
      timezone: SP,
      windows: [{ dow: SAB, start: "22:00", end: "06:00" }],
    });
    expect(dentroDoExpediente(plantaoSabado, brt(18, "23:00"))).toBe(true); // sábado à noite
    expect(dentroDoExpediente(plantaoSabado, brt(19, "05:59"))).toBe(true); // domingo de madrugada
    expect(dentroDoExpediente(plantaoSabado, brt(19, "06:00"))).toBe(false);
    expect(dentroDoExpediente(plantaoSabado, brt(18, "03:00"))).toBe(false); // madrugada de sábado
  });
  it('`end = "00:00"` vale a MEIA-NOITE: 08:00–00:00 cobre até 23:59 e não cobre 00:00 do dia seguinte', () => {
    const ateMeiaNoite = expedienteConfigSchema.parse({
      timezone: SP,
      windows: [{ dow: SEG, start: "08:00", end: "00:00" }],
    });
    expect(dentroDoExpediente(ateMeiaNoite, brt(13, "23:59"))).toBe(true);
    expect(dentroDoExpediente(ateMeiaNoite, brt(14, "00:00"))).toBe(false);
    expect(dentroDoExpediente(ateMeiaNoite, brt(13, "07:59"))).toBe(false);
  });
  it("uma janela comum e uma que vira o dia convivem", () => {
    const misto = expedienteConfigSchema.parse({
      timezone: SP,
      windows: [
        { dow: SEG, start: "08:00", end: "12:00" },
        { dow: SEG, start: "22:00", end: "06:00" },
      ],
    });
    expect(dentroDoExpediente(misto, brt(13, "09:00"))).toBe(true);
    expect(dentroDoExpediente(misto, brt(13, "15:00"))).toBe(false);
    expect(dentroDoExpediente(misto, brt(14, "02:00"))).toBe(true);
  });
});

describe("schema do expediente x schema do atendente", () => {
  const virada = { dow: 1, start: "22:00", end: "06:00" };

  it("o EXPEDIENTE aceita a virada; `start == end` é rejeitado", () => {
    expect(expedienteConfigSchema.safeParse({ timezone: SP, windows: [virada] }).success).toBe(true);
    expect(
      expedienteConfigSchema.safeParse({ timezone: SP, windows: [{ dow: 1, start: "08:00", end: "08:00" }] })
        .success,
    ).toBe(false);
  });

  it("REGRESSÃO — o horário por ATENDENTE continua rejeitando a virada (a agenda lê a mesma coluna)", () => {
    expect(scheduleWindowSchema.safeParse(virada).success).toBe(false);
    expect(availabilityScheduleSchema.safeParse({ timezone: SP, windows: [virada] }).success).toBe(false);
    // …e a janela comum continua aceita.
    expect(scheduleWindowSchema.safeParse({ dow: 1, start: "08:00", end: "18:00" }).success).toBe(true);
  });

  it("REGRESSÃO — sem a opção, `isWithinSchedule` trata a virada como antes: nunca contém nada", () => {
    const comVirada = { timezone: SP, windows: [virada] };
    expect(isWithinSchedule(comVirada, brt(13, "23:00"))).toBe(false);
    expect(isWithinSchedule(comVirada, brt(13, "23:00"), { viradaDeDia: true })).toBe(true);
    expect(janelaContem(virada, 1, "23:00")).toBe(false);
    expect(janelaContem(virada, 1, "23:00", true)).toBe(true);
  });

  it("janela comum se comporta igual com e sem a opção", () => {
    const j = { dow: 1, start: "08:00", end: "18:00" };
    for (const hhmm of ["07:59", "08:00", "12:00", "17:59", "18:00"]) {
      expect(janelaContem(j, 1, hhmm, true)).toBe(janelaContem(j, 1, hhmm, false));
    }
  });
});

describe("falha ABERTA — configuração torta nunca tranca a equipe", () => {
  it("sem configuração (null/undefined) está sempre dentro", () => {
    expect(dentroDoExpediente(null, brt(13, "03:00"))).toBe(true);
    expect(dentroDoExpediente(undefined, brt(13, "03:00"))).toBe(true);
  });
  it("`windows` vazio = sem restrição", () => {
    expect(dentroDoExpediente(expedienteConfigSchema.parse({ timezone: SP, windows: [] }), brt(13, "03:00"))).toBe(true);
    expect(dentroDoExpediente(expedienteConfigSchema.parse({}), brt(13, "03:00"))).toBe(true);
  });
  it("lerExpediente nunca lança: fuso inexistente, shape torto, tipo errado ⇒ null", () => {
    expect(lerExpediente({ timezone: "Marte/Olympus", windows: [] })).toBeNull();
    expect(lerExpediente({ timezone: SP, windows: "nenhuma" })).toBeNull();
    expect(lerExpediente({ timezone: SP, windows: [{ dow: 9, start: "08:00", end: "18:00" }] })).toBeNull();
    expect(lerExpediente("oito às seis")).toBeNull();
    expect(lerExpediente(null)).toBeNull();
    expect(lerExpediente(undefined)).toBeNull();
  });
  it("lerExpediente devolve a configuração válida", () => {
    expect(lerExpediente({ timezone: SP, windows: [{ dow: 1, start: "08:00", end: "18:00" }] })?.windows).toHaveLength(1);
  });
});

describe("proximaAbertura", () => {
  it("22h de segunda, comercial: abre terça 08:00", () => {
    expect(proximaAbertura(comercial, brt(13, "22:00"))?.toISOString()).toBe(brt(14, "08:00").toISOString());
  });
  it("sexta 19h: abre na SEGUNDA 08:00 (pula o fim de semana)", () => {
    expect(proximaAbertura(comercial, brt(17, "19:00"))?.toISOString()).toBe(brt(20, "08:00").toISOString());
  });
  it("domingo ao meio-dia: abre segunda 08:00", () => {
    expect(proximaAbertura(comercial, brt(19, "12:00"))?.toISOString()).toBe(brt(20, "08:00").toISOString());
  });
  it("antes do início no mesmo dia: abre hoje", () => {
    expect(proximaAbertura(comercial, brt(13, "06:30"))?.toISOString()).toBe(brt(13, "08:00").toISOString());
  });
  it("janela que vira o dia: segunda 12h, abre segunda 22:00", () => {
    expect(proximaAbertura(plantaoSegunda, brt(13, "12:00"))?.toISOString()).toBe(brt(13, "22:00").toISOString());
  });
  it("já dentro ⇒ null; sem expediente ⇒ null; sem janelas ⇒ null", () => {
    expect(proximaAbertura(comercial, brt(13, "12:00"))).toBeNull();
    expect(proximaAbertura(null, brt(13, "22:00"))).toBeNull();
    expect(proximaAbertura(expedienteConfigSchema.parse({ timezone: SP, windows: [] }), brt(13, "22:00"))).toBeNull();
  });
  it("com segundos no relógio, a abertura cai no minuto exato", () => {
    const agora = new Date("2026-07-13T22:00:37-03:00");
    expect(proximaAbertura(comercial, agora)?.toISOString()).toBe(brt(14, "08:00").toISOString());
  });
});

describe("RF-4 / RF-6 / RF-10 · expedienteBarra", () => {
  const FORA = brt(13, "22:00");
  const DENTRO = brt(13, "12:00");

  it("agent FORA do expediente é barrado, e a decisão traz a próxima abertura", () => {
    const d = expedienteBarra({ papel: "agent", config: comercial, agora: FORA });
    expect(d.barrado).toBe(true);
    expect(d.foraDoExpediente).toBe(true);
    expect(d.bypassAuditado).toBe(false);
    expect(d.abreEm?.toISOString()).toBe(brt(14, "08:00").toISOString());
  });
  it("agent DENTRO do expediente passa", () => {
    const d = expedienteBarra({ papel: "agent", config: comercial, agora: DENTRO });
    expect(d).toMatchObject({ barrado: false, foraDoExpediente: false, bypassAuditado: false, abreEm: null });
  });
  it("manager e admin NUNCA são barrados, mas o que fazem FORA do expediente é auditado", () => {
    for (const papel of ["manager", "admin"] as const) {
      const fora = expedienteBarra({ papel, config: comercial, agora: FORA });
      expect(fora.barrado).toBe(false);
      expect(fora.bypassAuditado).toBe(true);
      const dentro = expedienteBarra({ papel, config: comercial, agora: DENTRO });
      expect(dentro.barrado).toBe(false);
      expect(dentro.bypassAuditado).toBe(false);
    }
  });
  it("viewer não é barrado por expediente (já não escreve) nem gera bypass", () => {
    const d = expedienteBarra({ papel: "viewer", config: comercial, agora: FORA });
    expect(d.barrado).toBe(false);
    expect(d.bypassAuditado).toBe(false);
  });
  it("rota que declarou isenção (com motivo) não barra o agent", () => {
    const d = expedienteBarra({ papel: "agent", config: comercial, agora: FORA, isenta: true });
    expect(d.barrado).toBe(false);
    expect(d.foraDoExpediente).toBe(true);
  });
  it("sem expediente (ou torto) ninguém é barrado, nem auditado", () => {
    for (const config of [null, undefined, lerExpediente({ timezone: "Marte/Olympus" })]) {
      const d = expedienteBarra({ papel: "agent", config, agora: FORA });
      expect(d).toMatchObject({ barrado: false, foraDoExpediente: false, bypassAuditado: false });
    }
  });
});
