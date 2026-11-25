/**
 * Configurações → Distribuição de atendimento (issue #144).
 *
 * A TELA QUE FALTAVA. O rodízio entre atendentes (`settings.routing.mode =
 * round_robin`, worker em `lib/routing/`) e a restrição de visibilidade por
 * atendente (`settings.visibility_mode`, RLS em `fn_can_view_lead` /
 * `fn_can_view_conversation`) existem inteiros no backend desde a fase G4/G5 —
 * e não havia UMA tela no produto que os ligasse. Medido antes de escrever:
 * nenhum arquivo de `app/` ou `components/` consumia `/api/v1/settings/routing`,
 * e `visibility_mode` só aparecia sendo LIDO em `app/app/layout.tsx`.
 *
 * Num produto self-host isso equivale a a feature não existir: a única forma de
 * ligar era `UPDATE` à mão no Postgres. É o anti-exemplo literal de "toda
 * configuração tem superfície" (`docs/doctrine/restricao-de-canal.md`).
 *
 * Gate = manager+, que é o que a matriz da spec 13 §4 dá para
 * "atendimento/routing" — a mesma linha cobre as duas chaves.
 */
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { DEFAULT_VISIBILITY_MODE, ROLE_RANK, type VisibilityMode } from "@/lib/auth/types";
import { FUSO_PADRAO_DO_EDITOR, podeEditarOExpediente } from "@/lib/expediente/editor";
import { lerExpediente } from "@/lib/expediente/expediente";
import { routingConfigSchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { loadChannelRoutingSettings } from "@/lib/routing/channel-policies";
import { ChannelRoutingForm } from "./_channels-form";
import { AtendimentoForm } from "./_form";
import { ExpedienteSecao } from "./_expediente";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

export default async function AtendimentoSettingsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", activeOrg.orgId)
    .maybeSingle();

  const settings = ((data?.settings as Record<string, unknown> | null) ?? {}) as {
    routing?: unknown;
    visibility_mode?: VisibilityMode;
    business_hours?: unknown;
  };
  // `.catch(...)`: config antiga ou corrompida no jsonb não pode derrubar a
  // tela que serve justamente para consertá-la.
  const routing = routingConfigSchema.catch(routingConfigSchema.parse({})).parse(settings.routing ?? {});
  const idioma = user.idioma;
  // Expediente (PRD-01 / #67, T6). `lerExpediente` devolve `null` para "não configurado" e para
  // "gravado torto"; nos dois casos a tela parte do vazio, e a seção diz qual dos dois é (`invalido`).
  const expediente = lerExpediente(settings.business_hours) ?? { timezone: FUSO_PADRAO_DO_EDITOR, windows: [] };
  // Só o admin NA ORGANIZAÇÃO grava: a rota é `requireRole("admin")` sem `allowPlatformAdmin`, e a tela
  // espelha a rota (platform admin que é manager lê, e não vê o botão — senão levaria 403).
  const podeEditarExpediente = podeEditarOExpediente(activeOrg.role);
  // Algo gravado que não é um expediente válido: a leitura o trata como "sem expediente", e a seção
  // precisa deixar o admin consertá-lo (o Salvar fica ligado). Mesma regra de `descreverExpediente`.
  const ilegivel =
    settings.business_hours !== undefined &&
    settings.business_hours !== null &&
    lerExpediente(settings.business_hours) === null;
  const channels = await loadChannelRoutingSettings(supabase, activeOrg.orgId);

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <header>
        <h1 className="font-serif text-3xl font-bold tracking-tight">
          {traduzir("Distribuição de atendimento", idioma)}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {traduzir(
            "Quem recebe cada cliente novo, e o que cada atendente enxerga. As duas decisões andam juntas: distribuir sem restringir deixa todo mundo vendo a carteira do colega; restringir sem distribuir deixa o funil de cada um vazio.",
            idioma,
          )}
        </p>
      </header>

      <AtendimentoForm
        initial={{ ...routing, visibility_mode: settings.visibility_mode ?? DEFAULT_VISIBILITY_MODE }}
      />
      {/* O expediente vem ANTES dos responsáveis por número: a lista de canais cresce com a instalação, e
          uma configuração que fica depois dela some para quem não rola até o fim. */}
      <ExpedienteSecao initial={expediente} podeEditar={podeEditarExpediente} gravadoIlegivel={ilegivel} />
      <ChannelRoutingForm initial={channels} />
    </div>
  );
}
