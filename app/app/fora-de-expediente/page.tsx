"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { useExpediente } from "@/hooks/expediente/useExpediente";
import { descreverAbertura, descreverJanelas } from "@/lib/expediente/formatar";

/**
 * Fora do expediente — a página que a faixa do shell aponta (PRD-01 / #67).
 *
 * Informativa e SEMPRE alcançável: nunca é barrada e não redireciona ninguém (a decisão de produto é
 * "bloqueia a ação, não a leitura"), então não existe laço de redirecionamento a evitar. Mostra a
 * janela da empresa, quando o expediente abre e leva de volta às conversas, que o atendente continua
 * podendo ler. Dentro do expediente ela diz isso, em vez de mostrar uma tela de bloqueio falsa.
 */
export default function ForaDeExpedientePage() {
  const t = useT();
  const { data, isLoading, isError } = useExpediente();

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>;
  }
  if (isError || !data) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="expediente-indisponivel">
        {t("Não foi possível ler o expediente agora. As conversas continuam disponíveis para consulta.")}
      </p>
    );
  }

  const janelas = data.business_hours ? descreverJanelas(data.business_hours.windows, t) : [];
  const abre = descreverAbertura(data.opens_at, data.agora.iso, data.agora.timezone, t);
  const fora = data.restringe && !data.dentro;

  return (
    <div className="mx-auto max-w-xl space-y-6" data-testid="pagina-fora-de-expediente" data-estado={fora ? "fora" : "dentro"}>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {fora ? t("Fora do expediente") : t("Dentro do expediente")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {fora
            ? t("Você pode consultar as conversas e o histórico, mas só consegue agir quando o expediente abrir.")
            : data.restringe
              ? t("O expediente da empresa está aberto. Você pode atender normalmente.")
              : t("A empresa não definiu um expediente. Você pode atender a qualquer hora.")}
        </p>
      </header>

      {janelas.length > 0 && (
        <section className="rounded-lg border p-4" data-testid="janelas-do-expediente">
          <h2 className="mb-2 text-sm font-medium">{t("Expediente da empresa")}</h2>
          <ul className="space-y-1 text-sm">
            {janelas.map((j) => (
              <li key={j}>{j}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("Horário de")} {data.agora.timezone}
          </p>
        </section>
      )}

      {fora && abre && (
        <p className="text-sm" data-testid="abertura-do-expediente">
          {t("O expediente abre")} <strong className="font-medium">{abre}</strong>.
        </p>
      )}

      <Button asChild>
        <Link href="/app/inbox">{t("Consultar as conversas")}</Link>
      </Button>
    </div>
  );
}
