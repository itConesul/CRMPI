import { describe, expect, it } from "vitest";

import { descreverExpediente } from "./descrever";

const SEG_22H = new Date("2026-07-13T22:00:00-03:00");
const comercial = {
  timezone: "America/Sao_Paulo",
  windows: [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "08:00", end: "18:00" })),
};

describe("descreverExpediente — o que a tela e o e2e leem do servidor", () => {
  it("fora do expediente: restringe, não está dentro e diz quando abre (no relógio INJETADO)", () => {
    const d = descreverExpediente(comercial, SEG_22H);
    expect(d).toMatchObject({ configurado: true, invalido: false, restringe: true, dentro: false });
    expect(d.opens_at).toBe(new Date("2026-07-14T08:00:00-03:00").toISOString());
    expect(d.agora).toMatchObject({ timezone: "America/Sao_Paulo", dow: 1, hhmm: "22:00" });
  });

  it("dentro do expediente: sem `opens_at`", () => {
    const d = descreverExpediente(comercial, new Date("2026-07-13T12:00:00-03:00"));
    expect(d.dentro).toBe(true);
    expect(d.opens_at).toBeNull();
  });

  it("NÃO configurado (o estado de toda instalação que atualiza): não restringe e está sempre dentro", () => {
    for (const bruto of [undefined, null]) {
      const d = descreverExpediente(bruto, SEG_22H);
      expect(d).toMatchObject({
        business_hours: null,
        configurado: false,
        invalido: false,
        restringe: false,
        dentro: true,
        opens_at: null,
      });
      expect(d.agora.timezone).toBe("America/Sao_Paulo");
    }
  });

  it("`windows` vazio é configurado, mas NÃO restringe", () => {
    const d = descreverExpediente({ timezone: "America/Sao_Paulo", windows: [] }, SEG_22H);
    expect(d).toMatchObject({ configurado: true, restringe: false, dentro: true });
  });

  it("INVÁLIDO é distinguido de não configurado (a tela pode avisar o admin) e falha ABERTA", () => {
    for (const bruto of [{ timezone: "Marte/Olympus", windows: [] }, "oito às seis", { windows: "x" }]) {
      const d = descreverExpediente(bruto, SEG_22H);
      expect(d).toMatchObject({ business_hours: null, configurado: true, invalido: true, restringe: false, dentro: true });
    }
  });

  it("o `agora` é do FUSO do expediente, não do servidor", () => {
    const manaus = { timezone: "America/Manaus", windows: [{ dow: 1, start: "08:00", end: "18:00" }] };
    const d = descreverExpediente(manaus, new Date("2026-07-13T17:30:00-04:00"));
    expect(d.agora).toMatchObject({ timezone: "America/Manaus", hhmm: "17:30" });
  });
});
