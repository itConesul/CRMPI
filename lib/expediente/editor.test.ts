import { describe, expect, it } from "vitest";

import {
  SEMANA,
  fusoValido,
  janelasDoDia,
  mesmoExpediente,
  novaJanelaNoDia,
  ordenar,
  podeSalvar,
  problemaDaJanela,
  semanaComercial,
  viraODia,
} from "./editor";

const w = (dow: number, start: string, end: string) => ({ dow, start, end });

describe("a semana da empresa começa na segunda e termina no domingo", () => {
  it("SEMANA lista os 7 dias uma vez, com o domingo (0) por último", () => {
    expect([...SEMANA]).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it("ordenar põe o domingo depois do sábado e, no dia, pelo começo", () => {
    const fora = [w(0, "08:00", "12:00"), w(1, "13:00", "18:00"), w(1, "08:00", "12:00"), w(6, "09:00", "13:00")];
    expect(ordenar(fora)).toEqual([w(1, "08:00", "12:00"), w(1, "13:00", "18:00"), w(6, "09:00", "13:00"), w(0, "08:00", "12:00")]);
  });

  it("não muda a lista de entrada", () => {
    const entrada = [w(0, "08:00", "12:00"), w(1, "08:00", "12:00")];
    ordenar(entrada);
    expect(entrada[0]!.dow).toBe(0);
  });
});

describe("a janela que o botão cria", () => {
  it("a primeira do dia é o expediente comercial", () => {
    expect(novaJanelaNoDia([], 3)).toEqual(w(3, "08:00", "18:00"));
  });

  it("a segunda começa uma hora depois do fim da última e dura duas horas", () => {
    expect(novaJanelaNoDia([w(2, "08:00", "12:00")], 2)).toEqual(w(2, "13:00", "15:00"));
  });

  it("nunca passa das 23:00 nem nasce virando a meia-noite", () => {
    const nova = novaJanelaNoDia([w(2, "08:00", "22:30")], 2);
    expect(nova).toEqual(w(2, "21:00", "23:00"));
    expect(viraODia(nova)).toBe(false);
  });

  it("ignora a janela que vira o dia ao escolher onde a nova começa", () => {
    expect(novaJanelaNoDia([w(5, "22:00", "06:00")], 5)).toEqual(w(5, "08:00", "18:00"));
  });

  it("só olha o dia pedido", () => {
    expect(novaJanelaNoDia([w(1, "08:00", "12:00")], 2)).toEqual(w(2, "08:00", "18:00"));
    expect(janelasDoDia([w(1, "08:00", "12:00"), w(2, "09:00", "10:00")], 2)).toEqual([w(2, "09:00", "10:00")]);
  });
});

describe("o ponto de partida de quem nunca configurou", () => {
  it("segunda a sexta, 08:00–18:00, e sábado e domingo fechados", () => {
    const base = semanaComercial();
    expect(base).toHaveLength(5);
    expect(base.map((j) => j.dow)).toEqual([1, 2, 3, 4, 5]);
    expect(base.every((j) => j.start === "08:00" && j.end === "18:00")).toBe(true);
  });
});

describe("o que a tela recusa antes de ir ao servidor", () => {
  it("início igual ao fim é recusado; a virada de dia NÃO é", () => {
    expect(problemaDaJanela(w(1, "08:00", "08:00"))).toBe("igual");
    expect(problemaDaJanela(w(1, "22:00", "06:00"))).toBeNull();
    expect(viraODia(w(1, "22:00", "06:00"))).toBe(true);
    expect(viraODia(w(1, "08:00", "18:00"))).toBe(false);
  });

  it("horário vazio ou torto é recusado", () => {
    expect(problemaDaJanela(w(1, "", "18:00"))).toBe("vazia");
    expect(problemaDaJanela(w(1, "8:00", "18:00"))).toBe("vazia");
    expect(problemaDaJanela(w(1, "08:00", "24:00"))).toBe("vazia");
  });

  it("fuso que o Intl não conhece é recusado, e o acento digitado sem querer também", () => {
    expect(fusoValido("America/Sao_Paulo")).toBe(true);
    expect(fusoValido("Etc/UTC")).toBe(true);
    expect(fusoValido("America/Asunción")).toBe(false);
    expect(fusoValido("")).toBe(false);
    expect(fusoValido("   ")).toBe(false);
    expect(fusoValido("  Etc/UTC ")).toBe(true); // a tela apara antes de enviar
  });

  it("podeSalvar junta as três regras", () => {
    expect(podeSalvar({ timezone: "Etc/UTC", windows: semanaComercial() })).toBe(true);
    expect(podeSalvar({ timezone: "Etc/UTC", windows: [] })).toBe(true); // sem restrição é um estado válido
    expect(podeSalvar({ timezone: "Nao/Existe", windows: [] })).toBe(false);
    expect(podeSalvar({ timezone: "Etc/UTC", windows: [w(1, "08:00", "08:00")] })).toBe(false);
  });
});

describe("mesmoExpediente liga o botão Salvar só quando algo mudou", () => {
  it("a ordem em que as janelas foram digitadas não conta", () => {
    const a = { timezone: "Etc/UTC", windows: [w(1, "08:00", "12:00"), w(0, "08:00", "12:00")] };
    const b = { timezone: "Etc/UTC", windows: [w(0, "08:00", "12:00"), w(1, "08:00", "12:00")] };
    expect(mesmoExpediente(a, b)).toBe(true);
  });

  it("horário, dia ou fuso diferente conta", () => {
    const base = { timezone: "Etc/UTC", windows: [w(1, "08:00", "12:00")] };
    expect(mesmoExpediente(base, { ...base, windows: [w(1, "08:00", "13:00")] })).toBe(false);
    expect(mesmoExpediente(base, { ...base, windows: [w(2, "08:00", "12:00")] })).toBe(false);
    expect(mesmoExpediente(base, { ...base, timezone: "America/Sao_Paulo" })).toBe(false);
  });
});
