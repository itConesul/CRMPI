/**
 * Aviso de que a senha da conta foi trocada, no mesmo molde da recuperação
 * (`recuperar-senha.ts`): estilo inline, zero asset externo, tema CLARO sempre,
 * marca de `marcaDaSaida()`, cores da régua do produto.
 *
 * Existe para quem NÃO fez a troca. O aviso vai ao endereço cadastrado, então
 * quem o recebe é o dono da conta — e é ele quem percebe que alguém a trocou.
 * Por isso o texto diz o que fazer, e não só o que aconteceu.
 *
 * A troca NUNCA depende deste e-mail: instalação sem Resend simplesmente não o
 * envia (`app/actions/auth/changePassword.ts`).
 */
import { NEUTROS_DE_SAIDA, type MarcaDeSaida } from "@/lib/branding/saida";

export interface SenhaTrocadaEmailOptions {
  /** A marca da instalação. Obrigatória — sem ela o e-mail não tem dono. */
  marca: MarcaDeSaida;
  /** Endereço de "Esqueci a senha" desta instalação. */
  recuperarUrl: string;
}

export function buildSenhaTrocadaEmail(opts: SenhaTrocadaEmailOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const marca = opts.marca.nome;
  const subject = `Sua senha no ${marca} foi alterada`;

  // `<img>` solto, com dimensão no ATRIBUTO: o Outlook desktop descarta `height`
  // de style. Sem logo, nada é desenhado.
  const logo = opts.marca.logoUrl
    ? `<p style="margin:0 0 24px"><img src="${escapeHtml(opts.marca.logoUrl)}" alt="${escapeHtml(marca)}" height="40" style="height:40px;width:auto;max-width:200px;border:0;display:block"></p>`
    : "";

  const url = escapeHtml(opts.recuperarUrl);

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:${NEUTROS_DE_SAIDA.fundo};font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:${NEUTROS_DE_SAIDA.texto}">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    ${logo}
    <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;color:${NEUTROS_DE_SAIDA.texto}">
      Sua senha foi alterada
    </h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5">
      A senha da sua conta no ${escapeHtml(marca)} acabou de ser trocada. Por
      segurança, os outros aparelhos em que você estava conectado foram
      desconectados.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5">
      Foi você? Então não precisa fazer nada.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5">
      <strong>Não foi você?</strong> Defina uma senha nova agora e avise quem
      administra o sistema.
    </p>
    <p style="margin:24px 0">
      <a href="${url}" style="display:inline-block;padding:12px 24px;background:${opts.marca.accent};color:${opts.marca.accentFg};border-radius:6px;text-decoration:none;font-weight:600">
        Redefinir minha senha
      </a>
    </p>
    <p style="margin:0;font-size:13px;color:${NEUTROS_DE_SAIDA.suave}">
      Ou copie e cole este link no navegador:<br>
      <span style="word-break:break-all;color:${opts.marca.accent}">${url}</span>
    </p>
  </div>
</body>
</html>`;

  const text = [
    `A senha da sua conta no ${marca} acabou de ser trocada.`,
    "Por segurança, os outros aparelhos em que você estava conectado foram desconectados.",
    "",
    "Foi você? Então não precisa fazer nada.",
    "Não foi você? Defina uma senha nova agora e avise quem administra o sistema:",
    opts.recuperarUrl,
  ].join("\n");

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
