"use server";

import { headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/auth/schemas";
import { audit } from "@/lib/audit";
import { authRateLimited, AUTH_LIMITS } from "@/lib/auth/rate-limit";
import { marcaDaSaida } from "@/lib/branding/saida";
import { buildSenhaTrocadaEmail } from "@/lib/email/templates/senha-trocada";
import { emailConfigurado, sendEmail } from "@/lib/email/resend";
import { env } from "@/lib/env";

export type ChangePasswordResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "validation_error"
        | "session_expired"
        | "rate_limited"
        | "wrong_current_password"
        | "same_password"
        | "mfa_required"
        | "update_failed";
      details?: Record<string, unknown>;
    };

/**
 * Troca a PRÓPRIA senha, com a pessoa já logada (Configurações › Segurança).
 *
 * Existe porque a única ação que mudava a senha era a da sessão de recuperação,
 * que depende do e-mail — e uma instalação sem `RESEND_API_KEY`, o estado real
 * de um primeiro deploy, deixava o dono sem caminho (issue #106). **Esta troca
 * nunca depende de e-mail.**
 *
 * Ordem das guardas, e por quê:
 *  1. Zod — nada externo entra sem validar.
 *  2. Sessão (`getUser`, nunca `getSession`) — o e-mail vem DELA, não do corpo.
 *  3. Teto por CONTA, antes de tocar a senha: o formulário é um oráculo de
 *     senha para quem tem só a sessão.
 *  4. MFA: com fator cadastrado, a sessão tem de ser `aal2` — a mesma regra de
 *     desligar o próprio fator. Sem isso, quem rouba a sessão `aal1` de uma
 *     conta com MFA trocaria a senha sem nunca ter o código.
 *  5. Senha atual, verificada num client SEM cookie (ver `confereSenhaAtual`).
 *  6. `updateUser` — e, só então, derruba as OUTRAS sessões.
 */
export async function changePassword(input: ChangePasswordInput): Promise<ChangePasswordResult> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation_error",
      details: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { ok: false, error: "session_expired" };

  const hdrs = await headers();
  const requestId = hdrs.get("x-request-id");
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = hdrs.get("user-agent") ?? null;
  const contexto = { requestId, ip, userAgent };

  if (await authRateLimited("troca_de_senha", user.id, AUTH_LIMITS.troca_de_senha)) {
    await audit({
      action: "auth.password_change_failed",
      actorUserId: user.id,
      metadata: { reason: "rate_limited" },
      ...contexto,
    });
    return { ok: false, error: "rate_limited" };
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    await audit({
      action: "auth.password_change_failed",
      actorUserId: user.id,
      metadata: { reason: "mfa_required" },
      ...contexto,
    });
    return { ok: false, error: "mfa_required" };
  }

  if (parsed.data.current_password === parsed.data.password) {
    return { ok: false, error: "same_password" };
  }

  if (!(await confereSenhaAtual(user.email, parsed.data.current_password))) {
    await audit({
      action: "auth.password_change_failed",
      actorUserId: user.id,
      metadata: { reason: "wrong_current_password" },
      ...contexto,
    });
    return { ok: false, error: "wrong_current_password" };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (/different from the old password/i.test(error.message)) {
      return { ok: false, error: "same_password" };
    }
    await audit({
      action: "auth.password_change_failed",
      actorUserId: user.id,
      metadata: { reason: error.message },
      ...contexto,
    });
    return { ok: false, error: "update_failed" };
  }

  // A senha já mudou: daqui em diante nada pode desfazer o "ok". Derrubar as
  // outras sessões é o que dá sentido à troca para quem suspeita de vazamento —
  // mas se falhar, a troca vale e o motivo fica no audit.
  const { error: outras } = await supabase.auth.signOut({ scope: "others" });

  const aviso = await avisarPorEmail(user.email);

  await audit({
    action: "auth.password_changed",
    actorUserId: user.id,
    metadata: {
      other_sessions_revoked: !outras,
      email_dispatched: aviso,
    },
    ...contexto,
  });

  return { ok: true };
}

/**
 * A senha atual confere? Perguntada ao GoTrue por um client SEM cookie.
 *
 * ⚠️ NÃO use o client de sessão aqui. `signInWithPassword` nele substituiria a
 * sessão da pessoa por uma nova, em `aal1` — e a troca seguinte, numa conta com
 * MFA, passaria a ser recusada. O client avulso não toca no cookie, e a sessão
 * que ele abre é encerrada na hora para não deixar linha órfã no GoTrue.
 */
async function confereSenhaAtual(email: string, senha: string): Promise<boolean> {
  const avulso = createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await avulso.auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) return false;
  await avulso.auth.signOut();
  return true;
}

/** Só se o e-mail está configurado, e nunca derruba a troca. */
async function avisarPorEmail(para: string): Promise<boolean> {
  if (!emailConfigurado()) return false;
  try {
    const marca = await marcaDaSaida(null);
    const recuperarUrl = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/login/forgot`;
    const message = buildSenhaTrocadaEmail({ marca, recuperarUrl });
    const r = await sendEmail({
      to: para,
      ...message,
      fromName: marca.nome,
      tags: [{ name: "kind", value: "password_changed" }],
    });
    return r.ok;
  } catch {
    return false;
  }
}
