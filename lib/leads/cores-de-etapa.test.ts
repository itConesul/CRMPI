/**
 * A paleta do cabeçalho das colunas é MEDIDA, não escolhida a olho.
 *
 * O que se guarda aqui: toda cor da lista deixa o nome da etapa legível, e nenhuma
 * cor fora da lista chega ao banco. Uma cor nova que reprove o contraste não passa
 * daqui para a tela.
 */
import { describe, expect, it } from "vitest";

import { PISOS, razaoDeContraste } from "@/lib/branding/contraste";
import {
  CORES_DE_ETAPA,
  corDaPaleta,
  frenteDoCabecalho,
  validarCorDeEtapa,
} from "./cores-de-etapa";

describe("CORES_DE_ETAPA", () => {
  it("toda cor é #rrggbb em minúsculas — a forma que o banco aceita", () => {
    for (const c of CORES_DE_ETAPA) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("não repete hex, id nem rótulo", () => {
    for (const campo of ["hex", "id", "rotulo"] as const) {
      const valores = CORES_DE_ETAPA.map((c) => c[campo]);
      expect(new Set(valores).size, campo).toBe(valores.length);
    }
  });

  it.each(CORES_DE_ETAPA.map((c) => [c.rotulo, c.hex]))(
    "%s (%s): o texto do cabeçalho passa de 4,5:1",
    (_rotulo, hex) => {
      const razao = razaoDeContraste(frenteDoCabecalho(hex!), hex!);
      expect(razao).toBeGreaterThanOrEqual(PISOS.texto);
    },
  );

  it("toda cor da paleta leva texto BRANCO — o desenho é cabeçalho escuro, não tarja clara", () => {
    for (const c of CORES_DE_ETAPA) expect(frenteDoCabecalho(c.hex), c.rotulo).toBe("#ffffff");
  });
});

describe("frenteDoCabecalho", () => {
  it("cor clara que não é da paleta ainda recebe texto legível (etapa antiga)", () => {
    const amareloClaro = "#fde68a";
    const frente = frenteDoCabecalho(amareloClaro);

    expect(frente).toBe("#000000");
    expect(razaoDeContraste(frente, amareloClaro)).toBeGreaterThanOrEqual(PISOS.texto);
  });
});

describe("validarCorDeEtapa", () => {
  it("aceita uma cor da paleta e devolve a forma minúscula", () => {
    expect(validarCorDeEtapa("#1D4ED8")).toEqual({ ok: true, hex: "#1d4ed8" });
  });

  it("null tira a cor: o cabeçalho volta ao aspecto de fábrica", () => {
    expect(validarCorDeEtapa(null)).toEqual({ ok: true, hex: null });
  });

  it("recusa cor que não é da paleta, com frase de tela e sem nome de constraint", () => {
    const r = validarCorDeEtapa("#fde68a");

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro).toMatch(/cores da lista/);
      expect(r.erro).not.toMatch(/crm_stages|constraint|check/i);
    }
  });

  it("recusa lixo no lugar de hex", () => {
    for (const lixo of ["", "azul", "#12", "#gggggg", "javascript:alert(1)"]) {
      expect(validarCorDeEtapa(lixo).ok, lixo).toBe(false);
    }
  });
});

describe("corDaPaleta", () => {
  it("reconhece sem diferenciar maiúscula e ignora vazio", () => {
    expect(corDaPaleta("#506D48")?.id).toBe("verde-cone-sul");
    expect(corDaPaleta(null)).toBeNull();
    expect(corDaPaleta(undefined)).toBeNull();
    expect(corDaPaleta("#123456")).toBeNull();
  });
});
