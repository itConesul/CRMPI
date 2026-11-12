import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), warning: vi.fn(), info: vi.fn() },
}));

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";
import { caminhoSemQuery, classificarFalha, FalhaDeRede } from "@/lib/api/falha-de-rede";
import { ApiError } from "@/lib/api/types";

/** fetch que só termina quando o prazo do cliente o aborta — como um servidor mudo. */
function fetchMudo() {
  return vi.fn((_url: string, init: RequestInit) =>
    new Promise<Response>((_res, rej) => {
      init.signal?.addEventListener("abort", () =>
        rej(new DOMException("The operation was aborted.", "AbortError")),
      );
    }),
  );
}

function pegarErro(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => {
      throw new Error("devia ter falhado");
    },
    (e: unknown) => e,
  );
}

describe("falha sem resposta do servidor", () => {
  beforeEach(() => {
    toastError.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("classificarFalha: prazo vence, depois offline, depois rede", () => {
    expect(classificarFalha({ estourouPrazo: true, online: false })).toBe("timeout");
    expect(classificarFalha({ estourouPrazo: false, online: false })).toBe("offline");
    expect(classificarFalha({ estourouPrazo: false, online: true })).toBe("rede");
  });

  it("caminhoSemQuery tira ?query e #hash (a busca da pessoa não vai para o toast)", () => {
    expect(caminhoSemQuery("/api/v1/contacts?q=maria%20silva")).toBe("/api/v1/contacts");
    expect(caminhoSemQuery("/api/v1/x#a")).toBe("/api/v1/x");
    expect(caminhoSemQuery("/api/v1/x")).toBe("/api/v1/x");
  });

  it("servidor mudo por 10 s: FalhaDeRede 'timeout', com o X-Request-Id que foi enviado", async () => {
    vi.useFakeTimers();
    const f = fetchMudo();
    vi.stubGlobal("fetch", f);
    const p = pegarErro(apiClient.get("/api/v1/tasks?q=segredo"));
    await vi.advanceTimersByTimeAsync(40_000);
    const e = await p;
    expect(e).toBeInstanceOf(FalhaDeRede);
    const falha = e as FalhaDeRede;
    expect(falha.causa).toBe("timeout");
    expect(falha.metodo).toBe("GET");
    expect(falha.caminho).toBe("/api/v1/tasks");
    expect(falha.tentativas).toBe(3);
    expect(falha.duracaoMs).toBeGreaterThanOrEqual(30_000);
    const enviado = (f.mock.calls[0]![1].headers as Record<string, string>)["X-Request-Id"];
    expect(falha.requestId).toBe(enviado);
  });

  it("TypeError do fetch (conexão recusada) com o navegador online: 'rede'", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const p = pegarErro(apiClient.post("/api/v1/messages", { a: 1 }));
    await vi.advanceTimersByTimeAsync(5_000);
    const falha = (await p) as FalhaDeRede;
    expect(falha).toBeInstanceOf(FalhaDeRede);
    expect(falha.causa).toBe("rede");
    expect(falha.metodo).toBe("POST");
    expect(falha.original).toBeInstanceOf(TypeError);
  });

  it("navegador offline: 'offline'", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { onLine: false });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const p = pegarErro(apiClient.get("/api/v1/x"));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(((await p) as FalhaDeRede).causa).toBe("offline");
  });

  it("cancelamento de quem chamou NÃO vira FalhaDeRede (não é falha, é decisão)", async () => {
    const ctl = new AbortController();
    vi.stubGlobal("fetch", fetchMudo());
    const p = pegarErro(apiClient.get("/api/v1/x", { signal: ctl.signal }));
    ctl.abort();
    const e = await p;
    expect(e).not.toBeInstanceOf(FalhaDeRede);
  });

  it("resposta 500 continua sendo ApiError, não FalhaDeRede", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "internal_error", message: "x" } }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const e = await pegarErro(apiClient.get("/api/v1/x"));
    expect(e).toBeInstanceOf(ApiError);
  });

  it("o toast diz a causa e mostra método, caminho, tempo e ID — nunca o genérico", () => {
    showApiError(new FalhaDeRede("timeout", "abc-123", "GET", "/api/v1/tasks", 3, 31_400));
    const [titulo, op] = toastError.mock.calls[0] as [string, { description: string }];
    expect(titulo).toBe("O servidor não respondeu a tempo. Tente de novo.");
    expect(op.description).toBe("GET /api/v1/tasks · 31.4 s · ID: abc-123");
    expect(titulo).not.toMatch(/inesperado/i);
  });

  it("cada causa tem a sua frase", () => {
    const frases = (["timeout", "offline", "rede"] as const).map((c) => {
      toastError.mockClear();
      showApiError(new FalhaDeRede(c, "i", "GET", "/x", 1, 10));
      return (toastError.mock.calls[0] as [string])[0];
    });
    expect(new Set(frases).size).toBe(3);
  });

  it("erro que não é de rede nem ApiError ainda cai no genérico (o conhecido é que muda)", () => {
    showApiError(new Error("bug"));
    expect((toastError.mock.calls[0] as [string])[0]).toBe("Erro inesperado. Tente novamente.");
  });
});
