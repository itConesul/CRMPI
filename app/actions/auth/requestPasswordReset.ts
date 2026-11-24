"use server";

import { headers } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/auth/schemas";
import { audit, hashEmail } from "@/lib/audit";
import { authRateLimited, AUTH_LIMITS } from "@/lib/auth/rate-limit";
import { marcaDaSaida } from "@/lib/branding/saida";
import { buildRecuperarSenhaEmail } from "@/lib/email/templates/recuperar-senha";
import { emailConfigurado, sendEmail } from "@/lib/email/resend";
import { env } from "@/lib/env";

export type RequestPasswordResetResult =
  | { ok: true }
  | {
      ok: false;
      error: "validation_error" | "rate_limited" | "request_failed";
      details?: Record<string, unknown>;
    };

/**
 * Pede o e-mail de redefinição de senha. Dois caminhos, escolhidos pela
 * instalação:
 *
 *  - **Resend configurado:** o link é gerado AQUI, no servidor
 *    (`auth.admin.generateLink`), e enviado pelo Resend com a marca — o mesmo
 *    caminho do convite de time. O link leva `token_hash`, que não depende de
 *    cookie: abre no celular, em outro navegador, ou depois de limpar os dados.
 *  - **Sem Resend (ou se o envio falhar):** o Supabase envia, como sempre foi.
 *    O link desse caminho é PKCE (`?code=`) e só abre no navegador que pediu —
 *    é a limitação que o caminho do Resend existe para tirar.
 *
 * Resposta NEUTRA quanto à existência do e-mail: conta inexistente e e-mail
 * enviado respondem igual (`ok: true`).
 */
export async function requestPasswordReset(
  input: ForgotPasswordInput,
): Promise<RequestPasswordResetResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation_error",
      details: parsed.error.flatten().fieldErrors,
    };
  }

  const hdrs = await headers();
  const requestId = hdrs.get("x-request-id");
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = hdrs.get("user-agent") ?? null;
  const emailHash = hashEmail(parsed.data.email);

  // Sem teto, este endpoint é uma metralhadora de e-mail contra terceiros e um
  // oráculo de enumeração de conta. Issue #64.
  if (await authRateLimited("reset", parsed.data.email, AUTH_LIMITS.reset)) {
    return { ok: false, error: "rate_limited" };
  }

  // Sem Resend, o Supabase envia — a instalação continua como estava.
  if (!emailConfigurado()) {
    return viaSupabase(parsed.data.email, { emailHash, requestId, ip, userAgent });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: parsed.data.email,
  });

  const tokenHash = data?.properties?.hashed_token;

  if (error || !tokenHash) {
    // `User not found` é o caso comum e NÃO é falha: responde igual ao sucesso.
    // 429 e o resto é infraestrutura de verdade.
    const naoExiste = error?.status === 404 || /not found/i.test(error?.message ?? "");
    await audit({
      action: naoExiste
        ? "auth.password_reset_requested"
        : "auth.password_reset_request_failed",
      metadata: {
        email_hash: emailHash,
        reason: naoExiste ? "no_account" : (error?.message ?? "sem_token"),
        email_dispatched: false,
      },
      requestId,
      ip,
      userAgent,
    });
    if (naoExiste) return { ok: true };
    if (error?.status === 429) return { ok: false, error: "rate_limited" };
    return { ok: false, error: "request_failed" };
  }

  // NUNCA o header Origin: o link vai para o e-mail de um terceiro, e Origin é
  // controlado por quem faz o POST. `NEXT_PUBLIC_APP_URL` é o domínio público.
  // A query é UMA só, aberta aqui: `?token_hash=…&type=recovery`.
  const resetUrl = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;

  const marca = await marcaDaSaida(null);
  const message = buildRecuperarSenhaEmail({ resetUrl, marca });
  const result = await sendEmail({
    to: parsed.data.email,
    ...message,
    fromName: marca.nome,
    tags: [{ name: "kind", value: "password_reset" }],
  });

  if (!result.ok) {
    // O Resend falhou (domínio não verificado, limite, rede): quem pediu não
    // fica sem e-mail — o Supabase assume. O motivo fica no audit.
    await audit({
      action: "auth.password_reset_request_failed",
      metadata: {
        email_hash: emailHash,
        reason: result.error ?? "send_failed",
        email_dispatched: false,
        fallback: "supabase",
      },
      requestId,
      ip,
      userAgent,
    });
    return viaSupabase(parsed.data.email, { emailHash, requestId, ip, userAgent });
  }

  await audit({
    action: "auth.password_reset_requested",
    metadata: { email_hash: emailHash, email_dispatched: true },
    requestId,
    ip,
    userAgent,
  });

  return { ok: true };
}

type Contexto = {
  emailHash: string;
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
};

/** O caminho antigo: o GoTrue envia o e-mail com o template dele. */
async function viaSupabase(
  email: string,
  ctx: Contexto,
): Promise<RequestPasswordResetResult> {
  const hdrs = await headers();
  const origin = hdrs.get("origin") ?? env.NEXT_PUBLIC_APP_URL;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // ?type=recovery sobrevive ao redirect do GoTrue (preserva query string
    // existente ao anexar `code=`/`token_hash=`) — sem SMTP customizado o
    // Supabase usa o template padrão dele, que só devolve `code` (PKCE), sem
    // `type`; /auth/confirm depende deste param pra saber que é recovery.
    redirectTo: `${origin}/auth/confirm?type=recovery`,
  });

  if (error) {
    if (error.status === 429) return { ok: false, error: "rate_limited" };
    await audit({
      action: "auth.password_reset_request_failed",
      metadata: { email_hash: ctx.emailHash, reason: error.message },
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { ok: false, error: "request_failed" };
  }

  await audit({
    action: "auth.password_reset_requested",
    metadata: { email_hash: ctx.emailHash, via: "supabase" },
    requestId: ctx.requestId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  return { ok: true };
}
