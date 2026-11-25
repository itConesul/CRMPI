import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExpedienteDaApi } from "@/lib/expediente/descrever";
import type { ExpedienteConfig } from "@/lib/schemas/routing";

import { ExpedienteSecao } from "./_expediente";

/**
 * A SEÇÃO "EXPEDIENTE" DA TELA DE ATENDIMENTO (PRD-01 / #67, T6) — o que o admin vê e o que ele manda.
 *
 * Não prova o servidor (isso é `route.test.ts` e o e2e): prova que a tela monta o horário que o admin
 * tem na cabeça, que recusa o torto ANTES de ir à rede, que o `manager` só lê, e que o número do
 * contador aparece como número, como zero e como "—" (que NÃO é zero).
 */

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

let estado: { data?: ExpedienteDaApi; isLoading: boolean; isError: boolean };
vi.mock("@/hooks/expediente/useExpediente", () => ({ useExpediente: () => estado }));

const fetcher = vi.fn();

const vazio: ExpedienteConfig = { timezone: "America/Sao_Paulo", windows: [] };
const comercial: ExpedienteConfig = {
  timezone: "Etc/UTC",
  windows: [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "08:00", end: "18:00" })),
};

function api(parcial: Partial<ExpedienteDaApi> = {}): ExpedienteDaApi {
  return {
    business_hours: comercial,
    configurado: true,
    invalido: false,
    restringe: true,
    dentro: true,
    opens_at: null,
    agora: { iso: "2026-11-25T14:00:00.000Z", timezone: "Etc/UTC", dow: 3, hhmm: "14:00" },
    barrados_hoje: 0,
    ...parcial,
  };
}

function montar(props: { initial?: ExpedienteConfig; podeEditar?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ExpedienteSecao initial={props.initial ?? vazio} podeEditar={props.podeEditar ?? true} />
    </QueryClientProvider>,
  );
}

const corpoEnviado = () => JSON.parse(fetcher.mock.calls[0]![1].body as string) as { timezone: string; windows: unknown[] };

beforeEach(() => {
  fetcher.mockReset();
  fetcher.mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({ data: {} }),
  });
  vi.stubGlobal("fetch", fetcher);
  estado = { data: api(), isLoading: false, isError: false };
});

describe("montar o horário", () => {
  it("o atalho 'segunda a sexta' abre cinco dias e deixa sábado e domingo fechados", () => {
    montar();
    fireEvent.click(screen.getByTestId("expediente-preset-comercial"));
    for (const dow of [1, 2, 3, 4, 5]) expect(screen.getByTestId(`expediente-dia-${dow}`)).toHaveAttribute("data-aberto", "sim");
    for (const dow of [6, 0]) expect(screen.getByTestId(`expediente-dia-${dow}`)).toHaveAttribute("data-aberto", "nao");
    expect(screen.getByTestId("expediente-inicio-1-0")).toHaveValue("08:00");
    expect(screen.getByTestId("expediente-fim-1-0")).toHaveValue("18:00");
  });

  it("salvar manda exatamente o que está na tela, com o domingo no fim e o fuso sem espaço nas pontas", async () => {
    montar();
    fireEvent.change(screen.getByTestId("expediente-fuso"), { target: { value: "  Etc/UTC " } });
    fireEvent.click(screen.getByTestId("expediente-abrir-0"));
    fireEvent.click(screen.getByTestId("expediente-abrir-1"));
    fireEvent.change(screen.getByTestId("expediente-fim-1-0"), { target: { value: "12:00" } });
    fireEvent.click(screen.getByTestId("expediente-salvar"));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0]![0]).toContain("/api/v1/settings/expediente");
    expect(fetcher.mock.calls[0]![1].method).toBe("PATCH");
    expect(corpoEnviado()).toEqual({
      timezone: "Etc/UTC",
      windows: [
        { dow: 1, start: "08:00", end: "12:00" },
        { dow: 0, start: "08:00", end: "18:00" },
      ],
    });
  });

  it("'adicionar janela' cria o segundo turno do dia (almoço) sem apagar o primeiro", () => {
    montar({ initial: { timezone: "Etc/UTC", windows: [{ dow: 2, start: "08:00", end: "12:00" }] } });
    fireEvent.click(screen.getByTestId("expediente-acrescentar-2"));
    expect(screen.getByTestId("expediente-inicio-2-0")).toHaveValue("08:00");
    expect(screen.getByTestId("expediente-inicio-2-1")).toHaveValue("13:00");
    expect(screen.getByTestId("expediente-fim-2-1")).toHaveValue("15:00");
  });

  it("remover a única janela do dia fecha o dia", () => {
    montar({ initial: { timezone: "Etc/UTC", windows: [{ dow: 3, start: "08:00", end: "12:00" }] } });
    fireEvent.click(screen.getByTestId("expediente-remover-3-0"));
    expect(screen.getByTestId("expediente-fechado-3")).toBeVisible();
  });

  it("'sem restrição' limpa as janelas e o aviso diz o que isso significa", async () => {
    montar({ initial: comercial });
    fireEvent.click(screen.getByTestId("expediente-preset-sem-restricao"));
    expect(screen.getByTestId("expediente-aviso-vazio")).toBeVisible();
    fireEvent.click(screen.getByTestId("expediente-salvar"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(corpoEnviado().windows).toEqual([]);
  });

  it("a janela que vira o dia (22:00–06:00) é aceita e a tela diz que termina no dia seguinte", () => {
    montar({ initial: { timezone: "Etc/UTC", windows: [{ dow: 5, start: "22:00", end: "06:00" }] } });
    expect(screen.getByTestId("expediente-vira-5-0")).toBeVisible();
    expect(screen.getByTestId("expediente-salvar")).toBeDisabled(); // nada mudou
    fireEvent.change(screen.getByTestId("expediente-fuso"), { target: { value: "America/Sao_Paulo" } });
    expect(screen.getByTestId("expediente-salvar")).toBeEnabled();
  });
});

describe("o que a tela recusa antes de ir à rede", () => {
  it("início igual ao fim: erro ao lado do campo e Salvar desligado", () => {
    montar({ initial: comercial });
    fireEvent.change(screen.getByTestId("expediente-fim-1-0"), { target: { value: "08:00" } });
    expect(within(screen.getByTestId("expediente-dia-1")).getByRole("alert")).toHaveTextContent("O início e o fim não podem ser iguais.");
    expect(screen.getByTestId("expediente-salvar")).toBeDisabled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fuso que não existe (com o acento que um hispanofalante digita): erro e Salvar desligado", () => {
    montar({ initial: comercial });
    fireEvent.change(screen.getByTestId("expediente-fuso"), { target: { value: "America/Asunción" } });
    expect(screen.getByTestId("expediente-fuso-invalido")).toBeVisible();
    expect(screen.getByTestId("expediente-salvar")).toBeDisabled();
  });

  it("sem mudança, Salvar fica desligado", () => {
    montar({ initial: comercial });
    expect(screen.getByTestId("expediente-salvar")).toBeDisabled();
  });
});

describe("quem só lê", () => {
  it("o manager vê o horário, sem botão de salvar nem de editar, com o motivo escrito", () => {
    montar({ initial: comercial, podeEditar: false });
    expect(screen.getByTestId("expediente-somente-leitura")).toBeVisible();
    expect(screen.queryByTestId("expediente-salvar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("expediente-preset-comercial")).not.toBeInTheDocument();
    expect(screen.queryByTestId("expediente-acrescentar-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("expediente-inicio-1-0")).toBeDisabled();
    expect(screen.getByTestId("expediente-fuso")).toBeDisabled();
  });
});

describe("o estado que vem do servidor", () => {
  it("dentro do expediente: diz que está dentro, com a hora e o fuso da empresa", () => {
    montar({ initial: comercial });
    const agora = screen.getByTestId("expediente-agora");
    expect(agora).toHaveAttribute("data-dentro", "sim");
    expect(agora).toHaveTextContent("Agora a empresa está dentro do expediente.");
    expect(agora).toHaveTextContent("14:00 · Etc/UTC");
  });

  it("fora do expediente: diz quando abre", () => {
    estado = {
      data: api({ dentro: false, opens_at: "2026-11-26T08:00:00.000Z" }),
      isLoading: false,
      isError: false,
    };
    montar({ initial: comercial });
    expect(screen.getByTestId("expediente-agora")).toHaveAttribute("data-dentro", "nao");
    expect(screen.getByTestId("expediente-abre")).toHaveTextContent("amanhã às 08:00");
  });

  it("sem expediente: diz que ninguém é barrado, e não mostra contador", () => {
    estado = { data: api({ restringe: false, configurado: false, business_hours: null, barrados_hoje: null }), isLoading: false, isError: false };
    montar();
    expect(screen.getByTestId("expediente-sem-restricao")).toBeVisible();
    expect(screen.queryByTestId("expediente-contador")).not.toBeInTheDocument();
  });

  it("expediente gravado torto: avisa, em vez de fingir que não há nada", () => {
    estado = { data: api({ invalido: true, restringe: false, business_hours: null }), isLoading: false, isError: false };
    montar();
    expect(screen.getByTestId("expediente-invalido")).toBeVisible();
  });

  it("o contador distingue ZERO de 'não sei': 0 aparece como 0, null aparece como —", () => {
    montar({ initial: comercial });
    expect(screen.getByTestId("expediente-contador-valor")).toHaveTextContent("0");

    estado = { data: api({ barrados_hoje: 7 }), isLoading: false, isError: false };
    montar({ initial: comercial });
    expect(screen.getAllByTestId("expediente-contador-valor")[1]).toHaveTextContent("7");

    estado = { data: api({ barrados_hoje: null }), isLoading: false, isError: false };
    montar({ initial: comercial });
    const mudo = screen.getAllByTestId("expediente-contador-valor")[2]!;
    expect(mudo).toHaveTextContent("—");
    expect(mudo).toHaveAttribute("title", "A contagem não está disponível agora.");
  });

  it("a leitura do estado falha: a configuração continua editável e a tela diz que não leu", () => {
    estado = { data: undefined, isLoading: false, isError: true };
    montar({ initial: comercial });
    expect(screen.getByTestId("expediente-estado-indisponivel")).toBeVisible();
    expect(screen.getByTestId("expediente-inicio-1-0")).toBeEnabled();
  });
});

describe("quando o servidor recusa", () => {
  it("o erro aparece e o rascunho NÃO vira 'salvo'", async () => {
    fetcher.mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers(),
      json: async () => ({ error: { code: "forbidden", message: "Sem permissão." } }),
    });
    montar({ initial: comercial });
    fireEvent.change(screen.getByTestId("expediente-fim-1-0"), { target: { value: "19:00" } });
    fireEvent.click(screen.getByTestId("expediente-salvar"));
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("expediente-salvar")).toBeEnabled());
    expect(screen.getByText("Há mudanças não salvas.")).toBeVisible();
  });
});
