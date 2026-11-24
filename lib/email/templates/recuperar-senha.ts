/**
 * E-mail de recuperação de senha, no mesmo molde do convite de time
 * (`invite.ts`): estilo inline, zero asset externo, tema CLARO sempre, marca
 * resolvida por `marcaDaSaida()` e cores que vêm da régua do produto — nunca
 * hex digitado aqui.
 *
 * Existe porque o e-mail de recuperação saía do template PADRÃO do Supabase,
 * sem a marca e com um link em formato PKCE (`?code=`): esse formato só abre no
 * MESMO navegador que pediu a recuperação, porque a troca depende de um cookie
 * (`code_verifier`) gravado lá. Aberto no celular, ou depois de limpar cookies,
 * o link falhava. Este e-mail leva o `token_hash`, que não depende de cookie
 * nenhum (ver `app/actions/auth/requestPasswordReset.ts`).
 *
 * Sem quebra de privacidade: o e-mail não diz se a conta existe — quem o
 * recebe é, por construção, o dono do endereço.
 */
import { NEUTROS_DE_SAIDA, type MarcaDeSaida } from "@/lib/branding/saida";

export interface RecuperarSenhaEmailOptions {
  /** Link já montado (`/auth/confirm?token_hash=…&type=recovery`). */
  resetUrl: string;
  /** A marca da instalação. Obrigatória — sem ela o e-mail não tem dono. */
  marca: MarcaDeSaida;
}

export function buildRecuperarSenhaEmail(opts: RecuperarSenhaEmailOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const marca = opts.marca.nome;
  const subject = `Redefinir sua senha no ${marca}`;

  // `<img>` solto, com dimensão no ATRIBUTO: o Outlook desktop descarta `height`
  // de style. Sem logo, nada é desenhado — espaço vazio vira imagem quebrada.
  const logo = opts.marca.logoUrl
    ? `<p style="margin:0 0 24px"><img src="${escapeHtml(opts.marca.logoUrl)}" alt="${escapeHtml(marca)}" height="40" style="height:40px;width:auto;max-width:200px;border:0;display:block"></p>`
    : "";

  const url = escapeHtml(opts.resetUrl);

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:${NEUTROS_DE_SAIDA.fundo};font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:${NEUTROS_DE_SAIDA.texto}">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    ${logo}
    <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;color:${NEUTROS_DE_SAIDA.texto}">
      Redefinir sua senha
    </h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5">
      Recebemos um pedido para redefinir a senha da sua conta no ${escapeHtml(marca)}.
      Clique no botão para escolher uma senha nova.
    </p>
    <p style="margin:24px 0">
      <a href="${url}" style="display:inline-block;padding:12px 24px;background:${opts.marca.accent};color:${opts.marca.accentFg};border-radius:6px;text-decoration:none;font-weight:600">
        Definir nova senha
      </a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:${NEUTROS_DE_SAIDA.suave}">
      Ou copie e cole este link no navegador:<br>
      <span style="word-break:break-all;color:${opts.marca.accent}">${url}</span>
    </p>
    <p style="margin:24px 0 0;font-size:13px;color:${NEUTROS_DE_SAIDA.suave}">
      O link vale por tempo limitado e só pode ser usado uma vez. Se você não pediu
      a redefinição, pode ignorar este e-mail: sua senha continua a mesma.
    </p>
  </div>
</body>
</html>`;

  const text = [
    `Recebemos um pedido para redefinir a senha da sua conta no ${marca}.`,
    "",
    `Definir nova senha: ${opts.resetUrl}`,
    "",
    "O link vale por tempo limitado e só pode ser usado uma vez.",
    "Se você não pediu a redefinição, ignore este e-mail: sua senha continua a mesma.",
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
