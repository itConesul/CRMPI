import { describe, expect, it } from "vitest";

import {
  HEARTBEAT_TIMEOUT_MINUTES,
  isAttendantEligible,
  isHeartbeatStale,
  isWithinSchedule,
} from "./eligibility";
import { availabilityScheduleSchema } from "@/lib/schemas/routing";

/**
 * Elegibilidade (spec 13 §5) + heartbeat AT-08. Clock SEMPRE injetado (`now`) —
 * zero relógio implícito, zero sleep real; o "agora" é um parâmetro.
 */

// Seg 2026-07-13 14:00 America/Sao_Paulo (UTC-03) == 17:00Z. dow=1 (segunda).
const MON_1400_BRT = new Date("2026-07-13T17:00:00Z");
// Seg 2026-07-13 19:00 BRT == 22:00Z (fora de uma janela 08:00–18:00).
const MON_1900_BRT = new Date("2026-07-13T22:00:00Z");

const schedule8to18Mon = availabilityScheduleSchema.parse({
  timezone: "America/Sao_Paulo",
  windows: [{ dow: 1, start: "08:00", end: "18:00" }],
});

describe("isWithinSchedule (tz-aware)", () => {
  it("dentro da janela (seg 14:00 BRT, janela seg 08–18) ⇒ true", () => {
    expect(isWithinSchedule(schedule8to18Mon, MON_1400_BRT)).toBe(true);
  });

  it("fora da janela (seg 19:00 BRT, janela seg 08–18) ⇒ false", () => {
    expect(isWithinSchedule(schedule8to18Mon, MON_1900_BRT)).toBe(false);
  });

  it("dia sem janela (mesma hora mas janela só seg — testado terça) ⇒ false", () => {
    // Ter 2026-07-14 14:00 BRT == 17:00Z, dow=2 — sem janela ⇒ inelegível.
    const tue1400 = new Date("2026-07-14T17:00:00Z");
    expect(isWithinSchedule(schedule8to18Mon, tue1400)).toBe(false);
  });

  it("windows vazio (default '{}') ⇒ sem restrição (24/7) ⇒ true", () => {
    expect(isWithinSchedule({ timezone: "America/Sao_Paulo", windows: [] }, MON_1900_BRT)).toBe(
      true,
    );
  });
});

describe("isAttendantEligible (§5: disponível ∧ horário ∧ folga)", () => {
  const base = { isAvailable: true, capacity: 5, currentLoad: 2, schedule: schedule8to18Mon };

  it("disponível + dentro da janela + com folga (2/5) ⇒ elegível", () => {
    expect(isAttendantEligible(base, MON_1400_BRT)).toBe(true);
  });

  it("fora da janela (seg 19h) ⇒ NÃO elegível", () => {
    expect(isAttendantEligible(base, MON_1900_BRT)).toBe(false);
  });

  it("capacidade cheia (carga 5 == capacity 5) ⇒ NÃO elegível", () => {
    expect(isAttendantEligible({ ...base, currentLoad: 5 }, MON_1400_BRT)).toBe(false);
  });

  it("carga acima da capacidade (6 > 5) ⇒ NÃO elegível", () => {
    expect(isAttendantEligible({ ...base, currentLoad: 6 }, MON_1400_BRT)).toBe(false);
  });

  it("offline (is_available=false), mesmo com folga e no horário ⇒ NÃO elegível", () => {
    expect(isAttendantEligible({ ...base, isAvailable: false }, MON_1400_BRT)).toBe(false);
  });
});

describe("isHeartbeatStale (AT-08 auto-offline, clock mockado)", () => {
  const now = new Date("2026-07-13T17:00:00Z");

  it(`heartbeat há ${HEARTBEAT_TIMEOUT_MINUTES}min exatos ⇒ ainda vivo (não-estrito)`, () => {
    const at = new Date(now.getTime() - HEARTBEAT_TIMEOUT_MINUTES * 60_000).toISOString();
    expect(isHeartbeatStale(at, now)).toBe(false);
  });

  it("heartbeat há 16min ⇒ velho ⇒ auto-offline", () => {
    const at = new Date(now.getTime() - 16 * 60_000).toISOString();
    expect(isHeartbeatStale(at, now)).toBe(true);
  });

  it("heartbeat há 14min ⇒ ainda vivo", () => {
    const at = new Date(now.getTime() - 14 * 60_000).toISOString();
    expect(isHeartbeatStale(at, now)).toBe(false);
  });

  it("sem heartbeat (null) ⇒ velho ⇒ auto-offline", () => {
    expect(isHeartbeatStale(null, now)).toBe(true);
  });
});

describe("RF-12 · expediente da organização na elegibilidade (PRD-01 / #67)", () => {
  // Atendente 24/7 e com folga: sozinho seria elegível a qualquer hora.
  const livre = {
    isAvailable: true,
    capacity: 5,
    currentLoad: 1,
    schedule: availabilityScheduleSchema.parse({ timezone: "America/Sao_Paulo", windows: [] }),
  };
  const comercial = {
    timezone: "America/Sao_Paulo",
    windows: [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "08:00", end: "18:00" })),
  };

  it("dentro do expediente, a decisão é a de hoje (seg 14:00 BRT, comercial 08–18) ⇒ elegível", () => {
    expect(isAttendantEligible({ ...livre, expediente: comercial }, MON_1400_BRT)).toBe(true);
  });

  it("FORA do expediente o agent NÃO entra na distribuição, mesmo disponível, com folga e 24/7", () => {
    expect(isAttendantEligible({ ...livre, expediente: comercial }, MON_1900_BRT)).toBe(false);
  });

  it("REGRESSÃO — sem expediente (undefined, null, `windows` vazio) a decisão é exatamente a de antes", () => {
    for (const expediente of [undefined, null, { timezone: "America/Sao_Paulo", windows: [] }]) {
      expect(isAttendantEligible({ ...livre, expediente }, MON_1900_BRT)).toBe(true);
    }
    // E o objeto sem a chave `expediente` (todo chamador antigo) idem.
    expect(isAttendantEligible(livre, MON_1900_BRT)).toBe(true);
  });

  it("as camadas SOMAM: expediente aberto não salva quem está fora da PRÓPRIA janela", () => {
    const soDeTarde = availabilityScheduleSchema.parse({
      timezone: "America/Sao_Paulo",
      windows: [{ dow: 1, start: "13:00", end: "18:00" }],
    });
    const manha = new Date("2026-07-13T10:00:00-03:00"); // dentro do expediente, fora da janela própria
    expect(isAttendantEligible({ ...livre, schedule: soDeTarde, expediente: comercial }, manha)).toBe(false);
  });

  it("expediente que vira o dia: plantão 22:00–06:00 elegível às 23:00 e às 03:00 do dia seguinte", () => {
    const plantao = { timezone: "America/Sao_Paulo", windows: [{ dow: 1, start: "22:00", end: "06:00" }] };
    expect(isAttendantEligible({ ...livre, expediente: plantao }, new Date("2026-07-13T23:00:00-03:00"))).toBe(true);
    expect(isAttendantEligible({ ...livre, expediente: plantao }, new Date("2026-07-14T03:00:00-03:00"))).toBe(true);
    expect(isAttendantEligible({ ...livre, expediente: plantao }, new Date("2026-07-14T07:00:00-03:00"))).toBe(false);
  });
});
