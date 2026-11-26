import { describe, expect, it } from "vitest";

import { DICIONARIO, traduzir } from "@/lib/i18n/dicionario";

import { descreverAbertura, descreverJanelas } from "./formatar";

const w = (dow: number, start = "08:00", end = "18:00") => ({ dow, start, end });

describe("descreverJanelas — a janela é dita como o admin a escreveu", () => {
  it("segunda a sexta com o mesmo horário vira UMA frase", () => {
    expect(descreverJanelas([1, 2, 3, 4, 5].map((d) => w(d)))).toEqual(["seg a sex, 08:00–18:00"]);
  });

  it("a ordem de entrada não importa", () => {
    expect(descreverJanelas([5, 1, 3, 2, 4].map((d) => w(d)))).toEqual(["seg a sex, 08:00–18:00"]);
  });

  it("dias soltos viram lista com 'e'", () => {
    expect(descreverJanelas([w(1), w(3), w(5)])).toEqual(["seg, qua e sex, 08:00–18:00"]);
  });

  it("dois ou menos dias consecutivos não viram 'a'", () => {
    expect(descreverJanelas([w(1), w(2)])).toEqual(["seg, ter, 08:00–18:00"]);
  });

  it("horários diferentes viram frases separadas, na ordem da semana", () => {
    expect(
      descreverJanelas([w(1, "08:00", "18:00"), w(2, "08:00", "18:00"), w(3, "08:00", "18:00"), w(6, "08:00", "12:00")]),
    ).toEqual(["seg a qua, 08:00–18:00", "sáb, 08:00–12:00"]);
  });

  it("o domingo vai para o FIM da semana: 'sex a dom', não 'dom a sex'", () => {
    expect(descreverJanelas([5, 6, 0].map((d) => w(d)))).toEqual(["sex a dom, 08:00–18:00"]);
  });

  it("a janela que VIRA o dia aparece como foi escrita, sem ser partida em duas", () => {
    expect(descreverJanelas([w(1, "22:00", "06:00")])).toEqual(["seg, 22:00–06:00"]);
    expect(descreverJanelas([1, 2, 3, 4, 5].map((d) => w(d, "22:00", "06:00")))).toEqual(["seg a sex, 22:00–06:00"]);
  });

  it("sem janelas não há o que dizer", () => {
    expect(descreverJanelas([])).toEqual([]);
  });

  it("usa a função de tradução recebida", () => {
    const es: Record<string, string> = { seg: "lun", sex: "vie", a: "a" };
    expect(descreverJanelas([1, 2, 3, 4, 5].map((d) => w(d)), (t) => es[t] ?? t)).toEqual(["lun a vie, 08:00–18:00"]);
  });
});

describe("descreverJanelas — o dicionário de espanhol cobre todo termo que o formatador manda traduzir", () => {
  // O guarda `i18n-espanhol-cobre-a-tela` só enxerga `t("literal")`. Aqui os dias saem de um array
  // (`t(DIAS[d])`), então uma chave faltando passava em silêncio — foi o caso de `sáb` (#67, T7).
  it("cada palavra enviada a `t` (os 7 dias, o 'a' e o 'e') tem entrada no dicionário", () => {
    const enviadas = new Set<string>();
    const registra = (texto: string) => {
      enviadas.add(texto);
      return texto;
    };
    // Um dia por vez cobre os 7 nomes; 3 dias seguidos cobrem o "a"; dias soltos cobrem o "e".
    for (let dow = 0; dow < 7; dow++) descreverJanelas([w(dow)], registra);
    descreverJanelas([1, 2, 3].map((d) => w(d)), registra);
    descreverJanelas([w(1), w(3), w(5)], registra);
    // dois blocos com o mesmo horário: "seg a qua e sáb"
    descreverJanelas([w(1), w(2), w(3), w(6)], registra);

    expect([...enviadas].sort()).toEqual(["a", "e", "qua", "qui", "sex", "seg", "ter", "dom", "sáb"].sort());
    const semChave = [...enviadas].filter((texto) => DICIONARIO[texto]?.es === undefined);
    expect(semChave).toEqual([]);
  });

  it("com o dicionário real, a janela do sábado sai igual (em espanhol a abreviação também é 'sáb')", () => {
    expect(descreverJanelas([w(6, "08:00", "12:00")], (t) => traduzir(t, "es"))).toEqual(["sáb, 08:00–12:00"]);
  });
});

describe("descreverAbertura — a próxima abertura no FUSO da empresa", () => {
  const SP = "America/Sao_Paulo";
  // Segunda 22:00 em São Paulo.
  const agora = "2026-07-13T22:00:00-03:00";

  it("no mesmo dia: 'hoje às'", () => {
    expect(descreverAbertura("2026-07-13T23:30:00-03:00", agora, SP)).toBe("hoje às 23:30");
  });
  it("no dia seguinte: 'amanhã às'", () => {
    expect(descreverAbertura("2026-07-14T08:00:00-03:00", agora, SP)).toBe("amanhã às 08:00");
  });
  it("mais adiante: o dia da semana", () => {
    expect(descreverAbertura("2026-07-20T08:00:00-03:00", agora, SP)).toBe("seg, 08:00");
  });
  it("usa o fuso da EMPRESA, não o do navegador: 02:00 UTC de terça ainda é segunda à noite em SP", () => {
    expect(descreverAbertura("2026-07-14T02:30:00Z", "2026-07-14T01:00:00Z", SP)).toBe("hoje às 23:30");
  });
  it("sem abertura (já dentro, ou sem expediente) ⇒ null; data inválida ⇒ null", () => {
    expect(descreverAbertura(null, agora, SP)).toBeNull();
    expect(descreverAbertura(undefined, agora, SP)).toBeNull();
    expect(descreverAbertura("não é data", agora, SP)).toBeNull();
  });
  it("traduz os prefixos", () => {
    const es: Record<string, string> = { "amanhã às": "mañana a las" };
    expect(descreverAbertura("2026-07-14T08:00:00-03:00", agora, SP, (t) => es[t] ?? t)).toBe("mañana a las 08:00");
  });
});
