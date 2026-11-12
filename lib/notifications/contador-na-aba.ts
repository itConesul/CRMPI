/**
 * Contador de mensagens não vistas, para o título da aba — o "(3) WhatsApp" do
 * WhatsApp Web.
 *
 * Duas peças separadas de propósito: o NÚMERO (um valor externo ao React, que
 * quem recebe a mensagem soma e quem volta para a aba zera) e o TÍTULO (uma
 * função pura, que sabe tirar um contador que já estava lá antes de pôr o novo —
 * sem isso, cada navegação empilharia "(2) (2) (2) Inbox").
 */
const PREFIXO = /^\(\d+\+?\)\s+/;

export const TETO_VISIVEL = 99;

export function tituloComContador(titulo: string, n: number): string {
  const base = titulo.replace(PREFIXO, "");
  if (n <= 0) return base;
  return `(${n > TETO_VISIVEL ? `${TETO_VISIVEL}+` : n}) ${base}`;
}

type Ouvinte = () => void;

let naoVistas = 0;
const ouvintes = new Set<Ouvinte>();

function avisar(): void {
  for (const o of ouvintes) o();
}

export function obterNaoVistas(): number {
  return naoVistas;
}

export function somarNaoVistas(k = 1): void {
  naoVistas += k;
  avisar();
}

export function zerarNaoVistas(): void {
  if (naoVistas === 0) return;
  naoVistas = 0;
  avisar();
}

export function assinarNaoVistas(o: Ouvinte): () => void {
  ouvintes.add(o);
  return () => {
    ouvintes.delete(o);
  };
}
