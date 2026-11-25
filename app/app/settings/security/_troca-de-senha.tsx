"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword } from "@/app/actions/auth/changePassword";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/auth/schemas";
import { useT } from "@/hooks/i18n/useT";

const VAZIO: ChangePasswordInput = { current_password: "", password: "", password_confirm: "" };

/**
 * Trocar a PRÓPRIA senha, sem passar pelo e-mail (issue #106).
 *
 * O formulário limpa os três campos em QUALQUER resposta do servidor, de erro
 * inclusive: uma senha digitada não deve ficar na tela depois de recusada.
 */
export function TrocaDeSenha() {
  const t = useT();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: VAZIO,
  });

  const enviar = (valores: ChangePasswordInput) => {
    setErro(null);
    iniciar(async () => {
      const r = await changePassword(valores);
      reset(VAZIO);
      if (r.ok) {
        toast.success(t("Senha alterada. Os outros aparelhos foram desconectados."));
        return;
      }
      setErro(
        {
          wrong_current_password: t("A senha atual está incorreta."),
          same_password: t("A nova senha precisa ser diferente da atual."),
          rate_limited: t("Muitas tentativas. Aguarde alguns minutos e tente de novo."),
          mfa_required: t(
            "Sua conta tem verificação em duas etapas. Saia, entre de novo e informe o código de 6 dígitos antes de trocar a senha.",
          ),
          session_expired: t("Sua sessão expirou. Entre de novo."),
          validation_error: t("Dados inválidos. Confira os campos."),
          update_failed: t("Não foi possível trocar a senha. Tente novamente."),
        }[r.error],
      );
    });
  };

  return (
    <Card className="space-y-3 p-6">
      <div>
        <h2 className="text-sm font-semibold">{t("Senha")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            "Troque a senha da sua conta. Ao concluir, os outros aparelhos em que você está conectado são desconectados.",
          )}
        </p>
      </div>

      <form
        method="post"
        onSubmit={handleSubmit(enviar)}
        className="max-w-sm space-y-4"
        noValidate
        data-testid="troca-de-senha"
      >
        <div className="space-y-1.5">
          <Label htmlFor="current_password">{t("Senha atual")}</Label>
          <Input
            id="current_password"
            type="password"
            autoComplete="current-password"
            aria-invalid={errors.current_password ? true : undefined}
            {...register("current_password")}
          />
          {errors.current_password && (
            <p className="text-xs text-destructive">{t(errors.current_password.message ?? "")}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new_password">{t("Nova senha")}</Label>
          <Input
            id="new_password"
            type="password"
            autoComplete="new-password"
            aria-invalid={errors.password ? true : undefined}
            {...register("password")}
          />
          {errors.password && (
            <p className="text-xs text-destructive">{t(errors.password.message ?? "")}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new_password_confirm">{t("Confirmar nova senha")}</Label>
          <Input
            id="new_password_confirm"
            type="password"
            autoComplete="new-password"
            aria-invalid={errors.password_confirm ? true : undefined}
            {...register("password_confirm")}
          />
          {errors.password_confirm && (
            <p className="text-xs text-destructive">{t(errors.password_confirm.message ?? "")}</p>
          )}
        </div>
        {erro && (
          <div
            className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {erro}
          </div>
        )}
        <Button type="submit" disabled={pendente}>
          {pendente ? t("Trocando…") : t("Trocar senha")}
        </Button>
      </form>
    </Card>
  );
}
