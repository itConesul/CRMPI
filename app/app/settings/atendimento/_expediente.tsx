"use client";
/**
 * A seção EXPEDIENTE da tela de atendimento (PRD-01 / #67, T6).
 *
 * Até aqui o expediente só era configurável pela API: o gate (`403 OUT_OF_WORK_HOURS`), a faixa do shell
 * e a distribuição existiam, e nenhuma tela os ligava — num produto self-host isso é a feature não
 * existir. Esta seção é a porta (doutrina: "toda configuração tem superfície").
 *
 * A cópia importa mais que o layout. Quem instala numa VPS precisa ler, ANTES de salvar, o que
 * acontece: fora do horário o atendente continua VENDO as conversas e só não consegue AGIR; administrador
 * e gerente nunca são barrados. E precisa ver o que o sistema está fazendo AGORA (dentro ou fora) e
 * quantas tentativas o expediente barrou hoje — o estado vem do SERVIDOR (`useExpediente`), pela mesma
 * função que barra a ação, para a tela nunca divergir do `403`.
 *
 * Só o `admin` grava (a rota é `requireRole("admin")`); o `manager` chega aqui e LÊ, sem botão de salvar.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useExpediente } from "@/hooks/expediente/useExpediente";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import {
  SEMANA,
  fusoValido,
  mesmoExpediente,
  novaJanelaNoDia,
  ordenar,
  podeSalvar,
  problemaDaJanela,
  semanaComercial,
  viraODia,
} from "@/lib/expediente/editor";
import { descreverAbertura } from "@/lib/expediente/formatar";
import { randomId } from "@/lib/random-id";
import type { ExpedienteConfig, ExpedienteWindow } from "@/lib/schemas/routing";

const NOME_DO_DIA: Record<number, string> = {
  1: "Segunda-feira",
  2: "Terça-feira",
  3: "Quarta-feira",
  4: "Quinta-feira",
  5: "Sexta-feira",
  6: "Sábado",
  0: "Domingo",
};

/** Os fusos que o `Intl` conhece, para o campo sugerir. Só no navegador: no servidor a lista é vazia. */
function fusosConhecidos(): string[] {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    return supported ? supported("timeZone") : [];
  } catch {
    return [];
  }
}

/**
 * Uma janela como a tela a edita: com uma identidade PRÓPRIA (`uid`) que não muda enquanto se digita.
 *
 * A posição na lista e o `start` não servem de identidade: reordenar por `start` a cada tecla (e usar
 * o índice como `key`) trocava o turno sob o cursor — com 08:00–12:00 e 13:00–18:00, mudar o início do
 * primeiro para 14:00 deixava o foco no mesmo campo, que passava a mostrar o OUTRO turno. A ordem só
 * é arrumada ao carregar e ao salvar (revisão do #132, ponto 2).
 */
type JanelaEditavel = ExpedienteWindow & { uid: string };

const comIdentidade = (janelas: readonly ExpedienteWindow[]): JanelaEditavel[] =>
  ordenar(janelas).map((j) => ({ ...j, uid: randomId() }));
const semIdentidade = (janelas: readonly JanelaEditavel[]): ExpedienteWindow[] =>
  janelas.map(({ dow, start, end }) => ({ dow, start, end }));

const SEM_FUSOS: string[] = [];
let fusosEmCache: string[] | null = null;
const lerFusos = (): string[] => (fusosEmCache ??= fusosConhecidos());
const semAssinatura = () => () => {};

export function ExpedienteSecao({
  initial,
  podeEditar,
  gravadoIlegivel = false,
}: {
  initial: ExpedienteConfig;
  podeEditar: boolean;
  /**
   * Há algo gravado em `business_hours` que o sistema não consegue ler (a leitura o trata como "sem
   * expediente"). O aviso da tela manda "salvar de novo para consertar", então o Salvar tem de ficar
   * LIGADO nesse estado, mesmo com o rascunho igual ao que a tela mostra (revisão do #132, ponto 3).
   */
  gravadoIlegivel?: boolean;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const { data: estado, isLoading, isError } = useExpediente();

  const [timezone, setTimezone] = useState(initial.timezone);
  const [janelas, setJanelas] = useState<JanelaEditavel[]>(() => comIdentidade(initial.windows));
  const [salvo, setSalvo] = useState<ExpedienteConfig>(initial);
  const [ilegivel, setIlegivel] = useState(gravadoIlegivel);
  const [isPending, startTransition] = useTransition();
  // Lista de sugestões só no navegador: no servidor é vazia, e a primeira renderização do cliente
  // também, para a hidratação não divergir.
  const fusos = useSyncExternalStore(semAssinatura, lerFusos, () => SEM_FUSOS);

  const rascunho: ExpedienteConfig = { timezone, windows: semIdentidade(janelas) };
  const sujo = ilegivel || !mesmoExpediente(rascunho, salvo);
  const fusoOk = fusoValido(timezone);
  const salvavel = podeSalvar(rascunho);
  const desabilitado = isPending || !podeEditar;

  function trocar(uid: string, mudanca: Partial<ExpedienteWindow>) {
    setJanelas((js) => js.map((j) => (j.uid === uid ? { ...j, ...mudanca } : j)));
  }
  function remover(uid: string) {
    setJanelas((js) => js.filter((j) => j.uid !== uid));
  }
  function acrescentar(dow: number) {
    setJanelas((js) => [...js, { ...novaJanelaNoDia(semIdentidade(js), dow), uid: randomId() }]);
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!podeEditar || !salvavel) return;
    const corpo: ExpedienteConfig = { timezone: timezone.trim(), windows: ordenar(rascunho.windows) };
    startTransition(async () => {
      try {
        await apiClient.patch("/api/v1/settings/expediente", corpo);
        setSalvo(corpo);
        setIlegivel(false); // o que estava gravado torto foi substituído por um expediente válido
        // A faixa do shell e a página "fora de expediente" leem a mesma chave: sem isto, quem acabou
        // de salvar veria a faixa antiga por até um minuto.
        await queryClient.invalidateQueries({ queryKey: ["expediente"] });
        toast.success(t("Expediente salvo."));
      } catch (err) {
        toast.error(err instanceof Error ? t(err.message) : t("Não consegui salvar."));
      }
    });
  }

  const abertura = estado ? descreverAbertura(estado.opens_at, estado.agora.iso, estado.agora.timezone, t) : null;
  const dentro = !!estado && estado.dentro;

  return (
    <section className="flex max-w-3xl flex-col gap-4" data-testid="secao-expediente" aria-labelledby="titulo-expediente">
      <div>
        <h2 id="titulo-expediente" className="font-serif text-2xl font-bold tracking-tight">
          {t("Expediente da empresa")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "O horário em que sua equipe atende. Fora dele, o atendente continua vendo as conversas e o histórico, mas não consegue agir: responder, assumir, transferir ou fechar. Administrador e gerente nunca são barrados.",
          )}
        </p>
      </div>

      <Card className="space-y-2 p-4" data-testid="expediente-status" aria-live="polite">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>
        ) : isError || !estado ? (
          <p className="text-sm text-muted-foreground" data-testid="expediente-estado-indisponivel">
            {t("Não foi possível ler o estado do expediente agora. A configuração abaixo continua valendo.")}
          </p>
        ) : estado.invalido ? (
          <p
            data-testid="expediente-invalido"
            className="rounded-xl border border-amber-500/40 bg-amber-50/60 p-3 text-sm dark:bg-amber-900/10"
          >
            {t(
              "Há um expediente gravado que o sistema não consegue ler. Ele está sendo tratado como se não existisse, e ninguém é barrado. Salve de novo para consertar.",
            )}
          </p>
        ) : !estado.restringe ? (
          <p className="text-sm" data-testid="expediente-sem-restricao">
            {t("Nenhum horário definido: os atendentes podem agir a qualquer hora.")}
          </p>
        ) : (
          <p className="text-sm" data-testid="expediente-agora" data-dentro={dentro ? "sim" : "nao"}>
            <strong className="font-medium">
              {dentro ? t("Agora a empresa está dentro do expediente.") : t("Agora a empresa está fora do expediente.")}
            </strong>{" "}
            {`${estado.agora.hhmm} · ${estado.agora.timezone}.`}{" "}
            {!dentro && abertura ? (
              <span data-testid="expediente-abre">
                {t("O expediente abre")} <strong className="font-medium">{abertura}</strong>.
              </span>
            ) : null}
          </p>
        )}

        {estado?.restringe ? (
          <p className="text-xs text-muted-foreground" data-testid="expediente-contador">
            {t("Ações de atendentes barradas hoje")}:{" "}
            <strong
              className="font-medium text-foreground"
              data-testid="expediente-contador-valor"
              title={estado.barrados_hoje === null ? t("A contagem não está disponível agora.") : undefined}
            >
              {estado.barrados_hoje === null ? "—" : estado.barrados_hoje}
            </strong>
          </p>
        ) : null}
      </Card>

      <form onSubmit={salvar} className="flex flex-col gap-4" data-testid="form-expediente">
        {!podeEditar ? (
          <p className="rounded-xl border p-3 text-xs text-muted-foreground" data-testid="expediente-somente-leitura">
            {t("Só o administrador altera o expediente. Você pode consultar o horário abaixo.")}
          </p>
        ) : null}

        <Card className="space-y-4 p-4">
          <div className="space-y-1">
            <Label htmlFor="expediente-fuso">{t("Fuso horário da empresa")}</Label>
            <Input
              id="expediente-fuso"
              data-testid="expediente-fuso"
              list="expediente-fusos"
              value={timezone}
              disabled={desabilitado}
              aria-invalid={!fusoOk}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setTimezone(e.target.value)}
            />
            <datalist id="expediente-fusos">
              {fusos.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
            {fusoOk ? (
              <p className="text-xs text-muted-foreground">
                {t("Os horários abaixo valem neste fuso, e não no do navegador de quem olha. Ex.: America/Sao_Paulo.")}
              </p>
            ) : (
              <p className="text-xs text-destructive" data-testid="expediente-fuso-invalido" role="alert">
                {t("Este fuso horário não existe. Use o formato Região/Cidade, sem acento. Ex.: America/Asuncion.")}
              </p>
            )}
          </div>

          {podeEditar ? (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="expediente-preset-comercial"
                disabled={desabilitado}
                onClick={() => setJanelas(comIdentidade(semanaComercial()))}
              >
                {t("Segunda a sexta, 08:00–18:00")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="expediente-preset-sem-restricao"
                disabled={desabilitado}
                onClick={() => setJanelas([])}
              >
                {t("Sem restrição de horário")}
              </Button>
            </div>
          ) : null}

          <ul className="divide-y" data-testid="expediente-dias">
            {SEMANA.map((dow) => {
              // Na ORDEM do estado, e não por `start`: reordenar enquanto se digita trocava o turno sob o cursor.
              const doDia = janelas.filter((j) => j.dow === dow);
              return (
                <li
                  key={dow}
                  data-testid={`expediente-dia-${dow}`}
                  data-aberto={doDia.length > 0 ? "sim" : "nao"}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start"
                >
                  <span className="w-36 shrink-0 pt-2 text-sm font-medium">{t(NOME_DO_DIA[dow]!)}</span>
                  <div className="flex flex-1 flex-col gap-2">
                    {doDia.length === 0 ? (
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground" data-testid={`expediente-fechado-${dow}`}>
                          {t("Fechado")}
                        </span>
                        {podeEditar ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            data-testid={`expediente-abrir-${dow}`}
                            disabled={desabilitado}
                            onClick={() => acrescentar(dow)}
                          >
                            {t("Abrir neste dia")}
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      doDia.map((j, i) => {
                        const problema = problemaDaJanela(j);
                        return (
                          <div key={j.uid} className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                type="time"
                                className="w-32"
                                data-testid={`expediente-inicio-${dow}-${i}`}
                                aria-label={`${t(NOME_DO_DIA[dow]!)}: ${t("início")}`}
                                value={j.start}
                                disabled={desabilitado}
                                aria-invalid={problema !== null}
                                onChange={(e) => trocar(j.uid, { start: e.target.value })}
                              />
                              <span className="text-sm text-muted-foreground">{t("até")}</span>
                              <Input
                                type="time"
                                className="w-32"
                                data-testid={`expediente-fim-${dow}-${i}`}
                                aria-label={`${t(NOME_DO_DIA[dow]!)}: ${t("fim")}`}
                                value={j.end}
                                disabled={desabilitado}
                                aria-invalid={problema !== null}
                                onChange={(e) => trocar(j.uid, { end: e.target.value })}
                              />
                              {podeEditar ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  data-testid={`expediente-remover-${dow}-${i}`}
                                  aria-label={`${t("Remover janela")}: ${t(NOME_DO_DIA[dow]!)}`}
                                  disabled={desabilitado}
                                  onClick={() => remover(j.uid)}
                                >
                                  {t("Remover janela")}
                                </Button>
                              ) : null}
                            </div>
                            {viraODia(j) ? (
                              <p className="text-xs text-muted-foreground" data-testid={`expediente-vira-${dow}-${i}`}>
                                {t("Termina no dia seguinte.")}
                              </p>
                            ) : null}
                            {problema ? (
                              <p className="text-xs text-destructive" role="alert" data-testid={`expediente-problema-${dow}-${i}`}>
                                {problema === "igual"
                                  ? t("O início e o fim não podem ser iguais.")
                                  : t("Preencha o início e o fim.")}
                              </p>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                    {podeEditar && doDia.length > 0 ? (
                      <div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          data-testid={`expediente-acrescentar-${dow}`}
                          disabled={desabilitado}
                          onClick={() => acrescentar(dow)}
                        >
                          {t("Adicionar janela")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          {janelas.length === 0 ? (
            <p className="text-xs text-muted-foreground" data-testid="expediente-aviso-vazio">
              {t("Sem nenhuma janela, o expediente não restringe ninguém: os atendentes agem a qualquer hora.")}
            </p>
          ) : null}
        </Card>

        {podeEditar ? (
          <div className="flex items-center gap-3">
            <Button type="submit" data-testid="expediente-salvar" disabled={isPending || !sujo || !salvavel}>
              {isPending ? t("Salvando…") : t("Salvar expediente")}
            </Button>
            {sujo ? <span className="text-xs text-muted-foreground">{t("Há mudanças não salvas.")}</span> : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}
