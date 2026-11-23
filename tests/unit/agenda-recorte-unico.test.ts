/**
 * #94, CA-3 — quem DESENHA a grade do Mês e quem BUSCA os agendamentos usam a
 * mesma função. Nenhum dos dois calcula o início da grade por conta própria.
 *
 * Por que isto é um teste e não um comentário: o defeito nasceu de dois cálculos
 * escritos à mão em dois arquivos, que divergiram em silêncio. Um comentário
 * pedindo "mantenha iguais" não impede o próximo ajuste de reabrir a divergência;
 * esta varredura reprova no CI.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "..", "..");
const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

/** Remove comentários, para que um comentário explicativo não dispare a varredura. */
const semComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const QUEM_DESENHA = "components/agenda/GradeDaAgenda.tsx";
const QUEM_BUSCA = "app/app/agenda/_client.tsx";
const CALCULO_DO_INICIO_DA_GRADE = /startOfWeek\(\s*startOfMonth\(/;

describe("o início da grade do Mês tem uma fonte só (CA-3)", () => {
  it.each([
    ["quem desenha (VisaoDeMes)", QUEM_DESENHA],
    ["quem busca (recorteDaGrade)", QUEM_BUSCA],
  ])("%s importa lib/agenda/janela-da-grade", (_quem, arquivo) => {
    expect(ler(arquivo)).toMatch(/from "@\/lib\/agenda\/janela-da-grade"/);
  });

  it.each([
    ["quem desenha (VisaoDeMes)", QUEM_DESENHA],
    ["quem busca (recorteDaGrade)", QUEM_BUSCA],
  ])("%s não calcula o início da grade por conta própria", (_quem, arquivo) => {
    expect(
      semComentarios(ler(arquivo)),
      `${arquivo} voltou a calcular startOfWeek(startOfMonth(...)) à mão: use inicioDaGradeDoMes ` +
        "ou janelaDaGrade de lib/agenda/janela-da-grade (#94)",
    ).not.toMatch(CALCULO_DO_INICIO_DA_GRADE);
  });

  it("a busca do Mês não é mais o mês corrente (startOfMonth/endOfMonth) em _client.tsx", () => {
    const src = semComentarios(ler(QUEM_BUSCA));
    expect(src).not.toMatch(/endOfMonth\(/);
    expect(src).not.toMatch(/startOfMonth\(/);
  });

  it("EXCEÇÃO DELIBERADA (P1 da spec #94): o mini-calendário do PainelDeMarcacao fica de fora", () => {
    // `PainelDeMarcacao.tsx` tem o próprio `startOfWeek(startOfMonth(mes))`, e a
    // spec decidiu deixá-lo fora desta correção (a issue cita só VisaoDeMes e
    // recorteDaGrade; o mini-calendário não busca dados, só desenha). Este caso
    // existe para que a exceção seja LIDA e decidida, e não esquecida: se o
    // painel passar a usar a função compartilhada, remova esta asserção.
    expect(semComentarios(ler("components/agenda/PainelDeMarcacao.tsx"))).toMatch(
      CALCULO_DO_INICIO_DA_GRADE,
    );
  });
});
