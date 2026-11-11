/**
 * Issue #55 — avisos de mensagem: um por conversa, menos chamadas, contador na
 * aba e uma faixa que pede (ou explica) a permissão.
 */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { criarAgrupadorDeAvisos, type Emissao } from "@/lib/notifications/agrupar-avisos";
import { criarCacheDeContato, TITULO_GENERICO } from "@/lib/notifications/cache-de-contato";
import {
  assinarNaoVistas,
  obterNaoVistas,
  somarNaoVistas,
  tituloComContador,
  zerarNaoVistas,
} from "@/lib/notifications/contador-na-aba";
import { estadoDaFaixa } from "@/lib/notifications/estado-da-faixa";

// ─── agrupador ──────────────────────────────────────────────────────────────

describe("agrupador de avisos de mensagem", () => {
  const JANELA = 3_000;
  let emitidas: Emissao[];
  const msg = (c: string, i = 0) => ({ conversationId: c, contactId: `ct-${c}`, preview: `m${i}` });
  const criar = (limite = 3) => {
    emitidas = [];
    return criarAgrupadorDeAvisos({
      emitir: (e) => emitidas.push(e),
      janelaMs: JANELA,
      limiteDeConversas: limite,
    });
  };

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("o primeiro aviso da conversa sai NA HORA, com total 1", () => {
    const a = criar();
    a.avisar(msg("c1"));
    expect(emitidas).toEqual([
      { tipo: "conversa", conversationId: "c1", contactId: "ct-c1", preview: "m0", total: 1 },
    ]);
  });

  it("10 mensagens seguidas da mesma conversa = 1 aviso na hora + 1 atualização com a contagem", () => {
    const a = criar();
    for (let i = 0; i < 10; i += 1) a.avisar(msg("c1", i));
    expect(emitidas).toHaveLength(1);
    vi.advanceTimersByTime(JANELA);
    expect(emitidas).toHaveLength(2);
    expect(emitidas[1]).toMatchObject({ tipo: "conversa", conversationId: "c1", total: 10, preview: "m9" });
  });

  it("janela quieta não emite nada (sem aviso pendente, sem aviso)", () => {
    const a = criar();
    a.avisar(msg("c1"));
    vi.advanceTimersByTime(JANELA * 5);
    expect(emitidas).toHaveLength(1);
  });

  it("rajada longa respeita o teto de um aviso por conversa por janela", () => {
    const a = criar();
    for (let s = 0; s < 30; s += 1) {
      a.avisar(msg("c1", s));
      vi.advanceTimersByTime(1_000);
    }
    // 30 s, janela de 3 s: no máximo 1 aviso por janela (+ o imediato).
    expect(emitidas.length).toBeLessThanOrEqual(11);
    expect(emitidas.length).toBeLessThan(30);
  });

  it("a contagem de não vistas SOBE entre janelas e só volta com zerar()", () => {
    const a = criar();
    a.avisar(msg("c1"));
    vi.advanceTimersByTime(JANELA + 1);
    a.avisar(msg("c1"));
    expect(emitidas.at(-1)).toMatchObject({ total: 2 });
    a.zerar("c1");
    vi.advanceTimersByTime(JANELA + 1);
    a.avisar(msg("c1"));
    expect(emitidas.at(-1)).toMatchObject({ total: 1 });
  });

  it("zerar() descarta a atualização pendente da conversa que o atendente abriu", () => {
    const a = criar();
    a.avisar(msg("c1"));
    a.avisar(msg("c1", 1));
    a.zerar("c1");
    vi.advanceTimersByTime(JANELA * 2);
    expect(emitidas).toHaveLength(1);
  });

  it("6 conversas em poucos segundos: 3 avisos próprios + UM resumo, não 6 avisos", () => {
    const a = criar(3);
    for (const c of ["c1", "c2", "c3", "c4", "c5", "c6"]) a.avisar(msg(c));
    expect(emitidas.filter((e) => e.tipo === "conversa")).toHaveLength(3);
    expect(emitidas.filter((e) => e.tipo === "resumo")).toHaveLength(0);
    vi.advanceTimersByTime(JANELA);
    const resumos = emitidas.filter((e) => e.tipo === "resumo");
    expect(resumos).toEqual([{ tipo: "resumo", mensagens: 3, conversas: 3 }]);
  });

  it("o resumo conta mensagens, não só conversas", () => {
    const a = criar(1);
    a.avisar(msg("c1"));
    for (let i = 0; i < 4; i += 1) a.avisar(msg("c2", i));
    for (let i = 0; i < 2; i += 1) a.avisar(msg("c3", i));
    vi.advanceTimersByTime(JANELA);
    expect(emitidas.find((e) => e.tipo === "resumo")).toEqual({
      tipo: "resumo",
      mensagens: 6,
      conversas: 2,
    });
  });

  it("controle: com poucas conversas NÃO há resumo", () => {
    const a = criar(3);
    a.avisar(msg("c1"));
    a.avisar(msg("c2"));
    vi.advanceTimersByTime(JANELA * 3);
    expect(emitidas.some((e) => e.tipo === "resumo")).toBe(false);
  });

  it("zerarTudo() cancela atualização e resumo pendentes", () => {
    const a = criar(1);
    a.avisar(msg("c1"));
    a.avisar(msg("c1", 1));
    a.avisar(msg("c2"));
    a.zerarTudo();
    vi.advanceTimersByTime(JANELA * 3);
    expect(emitidas).toHaveLength(1);
  });
});

// ─── cache de contato ───────────────────────────────────────────────────────

describe("cache de nome e foto do contato", () => {
  const opcoes = { validadeMs: 300_000, validadeFalhaMs: 30_000 };

  it("50 pedidos do mesmo contato = UMA consulta (e as que chegam com ela em voo dividem a promessa)", async () => {
    const buscar = vi.fn().mockResolvedValue({ title: "Maria", icon: "https://x/f.jpg" });
    const c = criarCacheDeContato(buscar, opcoes);
    const todos = await Promise.all(Array.from({ length: 50 }, () => c.obter("ct1")));
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(todos.every((b) => b.title === "Maria")).toBe(true);
    await c.obter("ct1");
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("contatos diferentes têm consultas próprias", async () => {
    const buscar = vi.fn().mockImplementation(async (id: string) => ({ title: id }));
    const c = criarCacheDeContato(buscar, opcoes);
    await Promise.all([c.obter("a"), c.obter("b")]);
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it("expira: passada a validade, consulta de novo (a foto é URL assinada e vence)", async () => {
    let t = 0;
    const buscar = vi.fn().mockResolvedValue({ title: "Maria" });
    const c = criarCacheDeContato(buscar, { ...opcoes, agora: () => t });
    await c.obter("ct1");
    t = 299_000;
    await c.obter("ct1");
    expect(buscar).toHaveBeenCalledTimes(1);
    t = 300_001;
    await c.obter("ct1");
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it("consulta SEM nome vale pouco: não repete a cada mensagem, mas tenta de novo logo", async () => {
    let t = 0;
    const buscar = vi.fn().mockResolvedValue({ title: TITULO_GENERICO });
    const c = criarCacheDeContato(buscar, { ...opcoes, agora: () => t });
    await c.obter("ct1");
    t = 10_000;
    await c.obter("ct1");
    expect(buscar, "repetiu a consulta que falhou a cada mensagem").toHaveBeenCalledTimes(1);
    t = 30_001;
    await c.obter("ct1");
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it("consulta que LANÇA vira título genérico, nunca erro para quem avisa", async () => {
    const c = criarCacheDeContato(vi.fn().mockRejectedValue(new Error("rede")), opcoes);
    await expect(c.obter("ct1")).resolves.toEqual({ title: TITULO_GENERICO });
  });

  it("tem teto: uma sessão longa não cresce sem fim", async () => {
    const c = criarCacheDeContato(async (id) => ({ title: id }), { ...opcoes, maximo: 5 });
    for (let i = 0; i < 20; i += 1) await c.obter(`ct${i}`);
    expect(c.tamanho()).toBeLessThanOrEqual(5);
  });
});

// ─── contador na aba ────────────────────────────────────────────────────────

describe("título com contador", () => {
  it("põe o número na frente", () => {
    expect(tituloComContador("Inbox", 3)).toBe("(3) Inbox");
  });

  it("não empilha: tira o contador que já estava antes de pôr o novo", () => {
    expect(tituloComContador("(3) Inbox", 5)).toBe("(5) Inbox");
    expect(tituloComContador("(99+) Inbox", 2)).toBe("(2) Inbox");
  });

  it("zero remove o contador", () => {
    expect(tituloComContador("(3) Inbox", 0)).toBe("Inbox");
    expect(tituloComContador("Inbox", 0)).toBe("Inbox");
  });

  it("acima de 99 vira 99+", () => {
    expect(tituloComContador("Inbox", 100)).toBe("(99+) Inbox");
  });

  it("só tira o prefixo de contador, não um título que começa com parênteses de outra coisa", () => {
    expect(tituloComContador("(rascunho) Inbox", 1)).toBe("(1) (rascunho) Inbox");
  });
});

describe("contador de não vistas", () => {
  afterEach(() => zerarNaoVistas());

  it("soma, avisa quem assinou e zera", () => {
    const ouvinte = vi.fn();
    const sair = assinarNaoVistas(ouvinte);
    somarNaoVistas();
    somarNaoVistas(2);
    expect(obterNaoVistas()).toBe(3);
    expect(ouvinte).toHaveBeenCalledTimes(2);
    zerarNaoVistas();
    expect(obterNaoVistas()).toBe(0);
    sair();
    somarNaoVistas();
    expect(ouvinte, "continuou avisando depois de cancelar a assinatura").toHaveBeenCalledTimes(3);
  });
});

// ─── decisão da faixa ───────────────────────────────────────────────────────

describe("estadoDaFaixa", () => {
  const base = { contextoSeguro: true, permissao: "default" as const, dispensada: false };

  it("seguro e ainda sem resposta → pede", () => {
    expect(estadoDaFaixa(base)).toBe("pedir");
  });

  it("contexto INSEGURO → explica, e não oferece botão que falha (mesmo com permissão 'denied')", () => {
    expect(estadoDaFaixa({ ...base, contextoSeguro: false, permissao: "denied" })).toBe("inseguro");
    expect(estadoDaFaixa({ ...base, contextoSeguro: false })).toBe("inseguro");
  });

  it("seguro e bloqueado → diz como liberar", () => {
    expect(estadoDaFaixa({ ...base, permissao: "denied" })).toBe("bloqueado");
  });

  it("já concedida ou sem suporte → nenhuma faixa", () => {
    expect(estadoDaFaixa({ ...base, permissao: "granted" })).toBe("nenhuma");
    expect(estadoDaFaixa({ ...base, permissao: "unsupported" })).toBe("nenhuma");
  });

  it("dispensada → nenhuma, em qualquer estado", () => {
    for (const permissao of ["default", "denied", "granted"] as const) {
      expect(estadoDaFaixa({ ...base, permissao, dispensada: true })).toBe("nenhuma");
    }
    expect(estadoDaFaixa({ ...base, contextoSeguro: false, dispensada: true })).toBe("nenhuma");
  });
});

// ─── componentes ────────────────────────────────────────────────────────────

describe("<ContadorNaAba />", () => {
  beforeEach(() => {
    document.title = "Inbox";
    zerarNaoVistas();
  });
  afterEach(() => zerarNaoVistas());

  it("mostra o número no título, sobrevive à NAVEGAÇÃO (o Next reescreve o título) e some ao zerar", async () => {
    const { ContadorNaAba } = await import("@/components/app/ContadorNaAba");
    render(<ContadorNaAba />);

    act(() => somarNaoVistas(3));
    expect(document.title).toBe("(3) Inbox");

    // O Next troca o título a cada tela; o observador reaplica o contador.
    await act(async () => {
      document.title = "Contatos";
      await Promise.resolve();
    });
    expect(document.title).toBe("(3) Contatos");

    act(() => zerarNaoVistas());
    expect(document.title).toBe("Contatos");
  });

  it("voltar para a aba zera o contador", async () => {
    const { ContadorNaAba } = await import("@/components/app/ContadorNaAba");
    render(<ContadorNaAba />);
    act(() => somarNaoVistas(2));
    expect(document.title).toBe("(2) Inbox");

    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(obterNaoVistas()).toBe(0);
    expect(document.title).toBe("Inbox");
  });
});

describe("<FaixaDeAvisos />", () => {
  const permissao = vi.fn();
  const pedir = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    permissao.mockReset();
    pedir.mockReset();
    window.localStorage.clear();
    vi.doMock("@/hooks/notifications/useNotificationPermission", () => ({
      useNotificationPermission: () => ({
        permission: permissao(),
        enabled: false,
        request: pedir,
        setEnabled: vi.fn(),
      }),
    }));
  });
  afterEach(() => {
    vi.doUnmock("@/hooks/notifications/useNotificationPermission");
    vi.restoreAllMocks();
  });

  async function montar(seguro: boolean) {
    Object.defineProperty(window, "isSecureContext", { value: seguro, configurable: true });
    const { FaixaDeAvisos } = await import("@/components/app/FaixaDeAvisos");
    return render(<FaixaDeAvisos />);
  }

  it("seguro + 'default': oferece o botão, e clicar PEDE a permissão", async () => {
    permissao.mockReturnValue("default");
    await montar(true);
    await userEvent.click(await screen.findByRole("button", { name: /ativar avisos/i }));
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it("INSEGURO: explica o motivo e NÃO oferece o botão que falharia", async () => {
    permissao.mockReturnValue("denied");
    await montar(false);
    const faixa = await screen.findByTestId("faixa-de-avisos");
    expect(faixa.getAttribute("data-estado")).toBe("inseguro");
    expect(faixa.textContent).toMatch(/HTTPS|localhost/);
    expect(screen.queryByRole("button", { name: /ativar avisos/i })).toBeNull();
  });

  it("'Agora não' dispensa e lembra", async () => {
    permissao.mockReturnValue("default");
    const { unmount } = await montar(true);
    await userEvent.click(await screen.findByRole("button", { name: /agora não/i }));
    expect(screen.queryByTestId("faixa-de-avisos")).toBeNull();
    expect(window.localStorage.getItem("alerts.banner.dismissed")).toBe("1");
    unmount();
    await montar(true);
    expect(screen.queryByTestId("faixa-de-avisos")).toBeNull();
  });

  it("permissão já concedida: nenhuma faixa", async () => {
    permissao.mockReturnValue("granted");
    await montar(true);
    expect(screen.queryByTestId("faixa-de-avisos")).toBeNull();
  });
});
