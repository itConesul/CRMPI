import { describe, expect, it } from "vitest";

import { inserirMencao, resolverMencao } from "@/components/inbox/composer/MentionMenu";

// T2 da spec #69 — gatilho puro do `@` (CA-3, parte pura) e troca do trecho (CA-5).
// `cursor` é a posição logo após o último caractere digitado.

describe("resolverMencao — quando a lista abre (CA-3)", () => {
  it("abre com um `@` sozinho, com consulta vazia", () => {
    expect(resolverMencao("@", 1)).toEqual({ aberto: true, consulta: "", inicio: 0, fim: 1 });
  });

  it("abre depois de espaço e devolve a consulta digitada", () => {
    expect(resolverMencao("oi @an", 6)).toEqual({ aberto: true, consulta: "an", inicio: 3, fim: 6 });
  });

  it("abre depois de quebra de linha", () => {
    expect(resolverMencao("linha 1\n@ca", 11)).toEqual({ aberto: true, consulta: "ca", inicio: 8, fim: 11 });
  });

  it("não abre dentro de um e-mail (`ana@clinica.com`)", () => {
    expect(resolverMencao("ana@clinica.com", 15).aberto).toBe(false);
    expect(resolverMencao("ana@", 4).aberto).toBe(false);
  });

  it("não abre sem `@`", () => {
    expect(resolverMencao("oi tudo bem", 11).aberto).toBe(false);
    expect(resolverMencao("", 0).aberto).toBe(false);
  });

  it("fecha quando a consulta ganha um espaço (a consulta não contém espaço)", () => {
    expect(resolverMencao("oi @an ", 7).aberto).toBe(false);
    expect(resolverMencao("oi @an tudo", 11).aberto).toBe(false);
  });

  it("só olha o `@` mais próximo do cursor", () => {
    expect(resolverMencao("x @a@b", 6).aberto).toBe(false);
    expect(resolverMencao("@ana e @b", 9)).toEqual({ aberto: true, consulta: "b", inicio: 7, fim: 9 });
  });

  it("usa o cursor, não o fim do texto: cursor antes do `@` não abre", () => {
    expect(resolverMencao("oi @an", 2).aberto).toBe(false);
  });

  it("cursor no meio do texto: a consulta vai só até o cursor", () => {
    expect(resolverMencao("oi @ana tudo", 6)).toEqual({ aberto: true, consulta: "an", inicio: 3, fim: 6 });
  });

  it("tolera cursor fora da faixa", () => {
    expect(resolverMencao("oi @an", 99)).toEqual({ aberto: true, consulta: "an", inicio: 3, fim: 6 });
    expect(resolverMencao("oi @an", -3).aberto).toBe(false);
  });
});

describe("inserirMencao — troca de [inicio, fim) por token + espaço (CA-5)", () => {
  it("troca só `@an`, deixa `tudo` intacto e põe o cursor depois do espaço inserido", () => {
    const texto = "oi @an tudo";
    const r = resolverMencao(texto, 6);
    expect(inserirMencao(texto, r, "AnaSilva")).toEqual({
      texto: "oi @AnaSilva  tudo", // token + UM espaço; o espaço que já havia antes de `tudo` fica
      cursor: 3 + "@AnaSilva ".length,
    });
  });

  it("no fim do texto: token + um espaço, cursor no fim", () => {
    const texto = "oi @an";
    const r = resolverMencao(texto, 6);
    const saida = inserirMencao(texto, r, "AnaSilva");
    expect(saida).toEqual({ texto: "oi @AnaSilva ", cursor: 13 });
    expect(saida.cursor).toBe(saida.texto.length);
  });

  it("`@` sozinho vira o token", () => {
    const r = resolverMencao("@", 1);
    expect(inserirMencao("@", r, "Carla")).toEqual({ texto: "@Carla ", cursor: 7 });
  });

  it("aceita o user_id como token", () => {
    const id = "a1000000-0000-4000-8000-000000000001";
    const r = resolverMencao("oi @a", 5);
    expect(inserirMencao("oi @a", r, id)).toEqual({ texto: `oi @${id} `, cursor: 4 + id.length + 1 });
  });

  it("não mexe no que vem antes do `@`", () => {
    const texto = "linha 1\nlinha 2 @ca fim";
    const r = resolverMencao(texto, 19);
    expect(r.aberto).toBe(true);
    expect(inserirMencao(texto, r, "Carla").texto.startsWith("linha 1\nlinha 2 @Carla ")).toBe(true);
  });
});
