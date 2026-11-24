"use server";

import { headers } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";
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
      error: "validation_error" | "rate_limited" | "request_failed" | "email_not_configured";
      details?: Record<string, unknown>;
    };

/**
 * Pede o e-mail de redefinição de senha.
 *
 * O link é gerado AQUI, no servidor (`auth.admin.generateLink`), e enviado pelo
 * Resend com a marca da instalação — o mesmo caminho do convite de time. Antes
 * saía do template padrão do Supabase, em formato PKCE (`?code=`), que só abre
 * no mesmo navegador que pediu a recuperação (a troca depende do cookie
 * `code_verifier`). O `token_hash` não depende de cookie nenhum, então o link
 * abre no celular, em outro navegador, ou depois de limpar os cookies.
 *
 * ⚠️ Resposta NEUTRA quanto à existência do e-mail: conta inexistente e e-mail
 * enviado respondem igual (`ok: true`). Por isso o único erro que depende de
 * infraestrutura e é mostrado ao usuário é `email_not_configured`, e ele é
 * decidido ANTES de olhar a conta — não varia com o endereço digitado.
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

  // Sem Resend não há como entregar o link, e mostrar o link na tela seria
  // entregar a conta a quem digitar o e-mail de outra pessoa. Dizer a verdade
  // ao operador é o que sobra — e não vaza nada: independe do endereço.
  if (!emailConfigurado()) {
    await audit({
      action: "auth.password_reset_request_failed",
      metadata: { email_hash: emailHash, reason: "email_not_configured" },
      requestId,
      ip,
      userAgent,
    });
    return { ok: false, error: "email_not_configured" };
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
    await audit({
      action: "auth.password_reset_request_failed",
      metadata: {
        email_hash: emailHash,
        reason: result.error ?? "send_failed",
        email_dispatched: false,
      },
      requestId,
      ip,
      userAgent,
    });
    return {
      ok: false,
      error: result.error === "rate_limited" ? "rate_limited" : "request_failed",
    };
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
