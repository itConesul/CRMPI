/**
 * Esperar a próxima janela do TOTP NÃO pode comer o orçamento do teste.
 *
 * O servidor aceita cada código TOTP uma vez (proteção contra replay), então o
 * login que cai na mesma janela de 30 s do anterior espera a janela virar:
 * de 0,3 s a 30,3 s, conforme a fase do relógio de parede. Essa espera é
 * intencional e fica — o defeito era ela sair do mesmo `timeout` de 30 s que o
 * teste usa para fazer o trabalho dele.
 *
 * Medido (trace do `moeda-da-organizacao.spec.ts:87`, PR #84): 26,1 s dos
 * 30,9 s do teste foram um único `waitForTimeout` desta espera. O mesmo caso
 * levou 6,5 s, 18,4 s, 29,0 s e 31,2 s em quatro execuções do mesmo código —
 * e falhou nas duas vezes em que a espera caiu no fim da faixa.
 *
 * Por isso a espera ESTENDE o timeout do teste pelo mesmo tempo que dura. O
 * teste continua com os 30 s dele para o que ele faz; só a espera do relógio,
 * que ele não controla, deixa de contar contra ele.
 *
 * Os tipos são estruturais de propósito: este arquivo não importa o Playwright,
 * para que `tests/unit/espera-totp-estende-o-timeout.test.ts` o exercite no
 * vitest sem subir navegador.
 */
import { msUntilNextTotpWindow } from "./totp";

/** Folga depois da virada da janela, para o servidor já ter trocado de código. */
export const FOLGA_DA_JANELA_MS = 300;

export interface PaginaQueEspera {
  waitForTimeout(ms: number): Promise<void>;
}

/** O que `TestInfo` do Playwright oferece: o timeout atual e como trocá-lo. */
export interface TesteQueEstende {
  timeout: number;
  setTimeout(ms: number): void;
}

/**
 * Espera a próxima janela do TOTP e acrescenta essa espera ao timeout do teste.
 *
 * `teste` é `null` quando o helper roda fora de um teste (script, seed): então
 * só espera, que é o que fazia antes. Devolve quanto esperou.
 */
export async function esperarProximaJanelaTotp(
  page: PaginaQueEspera,
  teste: TesteQueEstende | null,
  agoraMs: number = Date.now(),
): Promise<number> {
  const espera = msUntilNextTotpWindow(agoraMs) + FOLGA_DA_JANELA_MS;
  // Timeout 0 = "sem limite" no Playwright: somar a ele o transformaria em um
  // limite, e um teste que não tinha teto passaria a ter.
  if (teste && teste.timeout > 0) teste.setTimeout(teste.timeout + espera);
  await page.waitForTimeout(espera);
  return espera;
}
