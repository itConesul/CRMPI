/**
 * #94 — a visão Mês busca a MESMA janela que desenha.
 *
 * A grade do Mês desenha 42 dias (6 semanas, a partir do domingo que abre o
 * mês). A busca pegava só o mês corrente, então os dias esmaecidos de outro mês
 * ficavam vazios, em silêncio, mesmo com compromisso ou ocupação do Google.
 *
 * Datas FIXAS e construídas em hora local: nada aqui lê o relógio (RNF-1). O
 * cenário que derrubou o CI (22/11, 23/11, 29/11 e 30/11/2026) é provado por
 * âncora, não por "rodar no dia certo".
 */
import { addDays, differenceInCalendarDays, startOfDay, startOfWeek } from "date-fns";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MAXIMO_DE_DIAS } from "@/lib/agenda/consulta";
import {
  DIAS_DA_GRADE_DO_MES,
  inicioDaGradeDoMes,
  janelaDaGrade,
} from "@/lib/agenda/janela-da-grade";

/** Dia de calendário local (meio-dia: longe de qualquer borda de fuso). */
const dia = (a: number, m: number, d: number) => new Date(a, m - 1, d, 12);

/** Os 42 dias que `VisaoDeMes` desenha, a partir do início declarado. */
function diasDesenhados(ancora: Date): Date[] {
  const inicio = inicioDaGradeDoMes(ancora);
  return Array.from({ length: DIAS_DA_GRADE_DO_MES }, (_, i) => addDays(inicio, i));
}

describe("janelaDaGrade — Mês (CA-1)", () => {
  const ancoras: Array<[string, Date]> = [
    ["22/11/2026 (domingo, dia em que o mês corrente ainda cobria a semana)", dia(2026, 11, 22)],
    ["23/11/2026 (a segunda em que o CI quebrou)", dia(2026, 11, 23)],
    ["29/11/2026", dia(2026, 11, 29)],
    ["30/11/2026 (hoje + 7 de 23/11, a âncora real da falha)", dia(2026, 11, 30)],
    ["1/12/2026", dia(2026, 12, 1)],
    ["1/1/2027 (virada de ano)", dia(2027, 1, 1)],
    ["fevereiro de 2026 (4 linhas de dias do mês)", dia(2026, 2, 14)],
    ["novembro de 2026 (mês de 5 linhas)", dia(2026, 11, 15)],
    ["agosto de 2026 (mês de 6 linhas: começa no sábado)", dia(2026, 8, 15)],
  ];

  it.each(ancoras)("todo dia desenhado está dentro da janela buscada — %s", (_nome, ancora) => {
    const { de, ate } = janelaDaGrade("mes", ancora);
    const desde = new Date(de).getTime();
    const ateMs = new Date(ate).getTime();

    for (const d of diasDesenhados(ancora)) {
      const inicioDoDia = startOfDay(d).getTime();
      expect(
        inicioDoDia >= desde && inicioDoDia < ateMs,
        `o dia ${d.toDateString()} é desenhado pela grade mas está FORA da janela [${de}, ${ate})`,
      ).toBe(true);
    }
  });

  it.each([
    ["29/11/2026", dia(2026, 11, 29)],
    ["30/11/2026", dia(2026, 11, 30)],
  ])("2/12/2026 está na janela com âncora em %s", (_nome, ancora) => {
    const { de, ate } = janelaDaGrade("mes", ancora);
    const doisDeDezembro = startOfDay(dia(2026, 12, 2)).getTime();
    expect(doisDeDezembro).toBeGreaterThanOrEqual(new Date(de).getTime());
    expect(doisDeDezembro).toBeLessThan(new Date(ate).getTime());
  });

  it("a janela começa no domingo que abre a grade, não no dia 1 do mês", () => {
    // 1/11/2026 é domingo; 1/8/2026 é sábado → a grade de agosto abre em 26/7.
    expect(inicioDaGradeDoMes(dia(2026, 11, 15))).toEqual(startOfDay(dia(2026, 11, 1)));
    expect(inicioDaGradeDoMes(dia(2026, 8, 15))).toEqual(startOfDay(dia(2026, 7, 26)));
    expect(new Date(janelaDaGrade("mes", dia(2026, 8, 15)).de)).toEqual(
      startOfDay(dia(2026, 7, 26)),
    );
  });
});

describe("janelaDaGrade — Mês, tamanho e teto (CA-2)", () => {
  it("são 42 dias de CALENDÁRIO e cabem no teto da API", () => {
    expect(DIAS_DA_GRADE_DO_MES).toBe(42);
    const { de, ate } = janelaDaGrade("mes", dia(2026, 11, 23));
    expect(differenceInCalendarDays(new Date(ate), new Date(de))).toBe(42);
    expect(42).toBeLessThanOrEqual(MAXIMO_DE_DIAS);
  });

  describe("atravessando mudança de horário de verão", () => {
    const antes = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = "America/New_York";
    });
    afterAll(() => {
      if (antes === undefined) delete process.env.TZ;
      else process.env.TZ = antes;
    });

    it("o fuso do teste foi de fato fixado (senão a prova abaixo seria vazia)", () => {
      // Nova York: GMT-5 em março até o dia 8, GMT-4 depois. Se o runtime ignorou
      // o `TZ` em execução, os dois offsets saem iguais e este teste reprova ALTO,
      // em vez de deixar o caso de horário de verão passar sem medir nada.
      const emMarco1 = new Date(2026, 2, 1, 12).getTimezoneOffset();
      const emMarco31 = new Date(2026, 2, 31, 12).getTimezoneOffset();
      expect(emMarco1).not.toBe(emMarco31);
    });

    it("a janela que cruza 8/3/2026 segue com 42 dias de calendário (e não 42×24h)", () => {
      const { de, ate } = janelaDaGrade("mes", new Date(2026, 2, 1, 12));
      expect(differenceInCalendarDays(new Date(ate), new Date(de))).toBe(42);
      // Em milissegundos são 42 dias MENOS 1 hora: é por isso que a conta não
      // pode ser `de + 42 * 86_400_000`.
      const ms = new Date(ate).getTime() - new Date(de).getTime();
      expect(ms).toBe(42 * 86_400_000 - 3_600_000);
    });
  });
});

describe("janelaDaGrade — Semana e Dia não mudaram (CA-6)", () => {
  // Quarta, 25/11/2026. Valores de ANTES do conserto, escritos à mão.
  const ancora = dia(2026, 11, 25);

  it("Semana: do domingo anterior até 7 dias depois", () => {
    const { de, ate } = janelaDaGrade("semana", ancora);
    expect(de).toBe(new Date(2026, 10, 22).toISOString());
    expect(ate).toBe(new Date(2026, 10, 29).toISOString());
    expect(new Date(de)).toEqual(startOfWeek(ancora, { weekStartsOn: 0 }));
  });

  it("Dia: do começo do dia até o começo do seguinte", () => {
    const { de, ate } = janelaDaGrade("dia", ancora);
    expect(de).toBe(new Date(2026, 10, 25).toISOString());
    expect(ate).toBe(new Date(2026, 10, 26).toISOString());
  });
});
