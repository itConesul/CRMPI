/**
 * A janela de tempo que a grade da Agenda BUSCA — definida uma vez, e só aqui.
 *
 * ─── O defeito que esta função existe para impedir (#94) ───────────────────
 *
 * A visão Mês DESENHA 42 dias: seis semanas a partir do domingo que abre o mês,
 * inclusive os dias esmaecidos do mês anterior e do seguinte. Mas BUSCAVA só do
 * dia 1 ao último dia do mês. Os dias esmaecidos apareciam vazios, em silêncio,
 * mesmo com compromisso ou ocupação do Google — e quem opera a agenda perdia de
 * vista um compromisso real. Apareceu como falha de e2e porque o teste usa
 * "hoje + 7 dias", que numa virada de mês cai numa célula esmaecida.
 *
 * Quem desenha e quem busca eram dois cálculos escritos à mão em dois arquivos.
 * Aqui eles passam a ser UM: `VisaoDeMes` obtém o início da grade e o tamanho
 * dela daqui, e `_client.tsx` obtém a janela daqui. Se a grade mudar de forma,
 * muda nos dois lugares ao mesmo tempo.
 *
 * Funções puras: sem I/O e sem relógio. A âncora é argumento, o que também é o
 * que torna a prova independente do dia em que o teste roda.
 */
import { addDays, startOfDay, startOfMonth, startOfWeek } from "date-fns";

import type { VisaoDaAgenda } from "@/components/agenda/tipos";

/** Seis semanas × sete dias. Sempre seis, mesmo quando o mês cabe em cinco: a
 *  célula não pode mudar de altura ao virar o mês. */
export const DIAS_DA_GRADE_DO_MES = 42;

/** O domingo que abre a grade do Mês — pode ser do mês anterior. */
export function inicioDaGradeDoMes(ancora: Date): Date {
  return startOfWeek(startOfMonth(ancora), { weekStartsOn: 0 });
}

/**
 * O recorte `[de, ate)` que a grade desenha, em instantes ISO.
 *
 * - **Mês:** do início da grade até 42 dias depois. `addDays` soma dias de
 *   CALENDÁRIO, não milissegundos: numa janela que cruza mudança de horário de
 *   verão, `+ 42 * 24h` terminaria uma hora fora do dia certo.
 * - **Semana** e **Dia:** inalterados.
 *
 * Instante ISO, nunca o filtro `dia`: `dia=` corta em UTC e some com o
 * compromisso das 22h no fuso de São Paulo.
 */
export function janelaDaGrade(visao: VisaoDaAgenda, ancora: Date): { de: string; ate: string } {
  const inicio =
    visao === "mes"
      ? inicioDaGradeDoMes(ancora)
      : visao === "semana"
        ? startOfWeek(ancora, { weekStartsOn: 0 })
        : startOfDay(ancora);
  const dias = visao === "mes" ? DIAS_DA_GRADE_DO_MES : visao === "semana" ? 7 : 1;
  return { de: inicio.toISOString(), ate: addDays(inicio, dias).toISOString() };
}
