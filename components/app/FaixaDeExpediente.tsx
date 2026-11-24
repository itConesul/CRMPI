"use client";

import Link from "next/link";

import { useT } from "@/hooks/i18n/useT";
import { useExpedienteBarra } from "@/hooks/expediente/useExpediente";
import { descreverAbertura, descreverJanelas } from "@/lib/expediente/formatar";

/**
 * A faixa que diz ao atendente POR QUE as ações estão travadas fora do expediente (PRD-01 / #67).
 *
 * O servidor recusa a ação (`403 OUT_OF_WORK_HOURS`); esta faixa é a explicação na tela — uma ação
 * recusada sem motivo parece defeito. Aparece só para o `agent` e só fora do expediente: `admin` e
 * `manager` nunca são barrados, e quem não tem expediente configurado nunca a vê. A leitura continua
 * liberada, e a faixa diz isso.
 *
 * Mora no shell, ao lado da `FaixaDeAvisos`, para valer em toda tela do app.
 */
export function FaixaDeExpediente() {
  const t = useT();
  const { barrado, data } = useExpedienteBarra();
  if (!barrado || !data?.business_hours) return null;

  const janelas = descreverJanelas(data.business_hours.windows, t).join(" · ");
  const abre = descreverAbertura(data.opens_at, data.agora.iso, data.agora.timezone, t);

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 border-b bg-muted/60 px-6 py-2 text-sm"
      data-testid="faixa-de-expediente"
      data-estado="fora"
    >
      <p className="min-w-0 flex-1">
        <strong className="font-medium">{t("Fora do expediente da empresa.")}</strong>{" "}
        {janelas ? `${t("Expediente:")} ${janelas}. ` : ""}
        {t("Você pode consultar as conversas, mas só consegue agir quando o expediente abrir")}
        {abre ? ` (${abre})` : ""}.
      </p>
      <Link
        href="/app/fora-de-expediente"
        className="text-sm font-medium underline underline-offset-4 hover:text-foreground"
      >
        {t("Saiba mais")}
      </Link>
    </div>
  );
}
