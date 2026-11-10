import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/types";
import {
  armazemEmMemoria,
  envioUnico,
  JANELA_SEGUNDOS,
  type EnvioUnicoArgs,
} from "@/lib/messaging/envio-unico";

type Msg = { id: string; status?: string };

const base: EnvioUnicoArgs = {
  organizationId: "org-1",
  userId: "u-1",
  conversationId: "c-1",
  type: "text",
  body: "opa",
  idempotencyKey: "k-1",
};

function mundo() {
  const banco = new Map<string, Msg>();
  let n = 0;
  const enviar = vi.fn(async (): Promise<Msg> => {
    const m = { id: `m-${++n}`, status: "sent" };
    banco.set(m.id, m);
    return m;
  });
  const buscar = async (id: string) => banco.get(id) ?? null;
  return { enviar, buscar, banco };
}

describe("envioUnico: o mesmo envio não sai duas vezes", () => {
  it("A — mesma Idempotency-Key (retry do cliente): envia UMA vez e devolve a mesma mensagem", async () => {
    const arm = armazemEmMemoria();
    const w = mundo();
    const a = await envioUnico(base, arm, w.enviar, w.buscar);
    const b = await envioUnico(base, arm, w.enviar, w.buscar);
    expect(w.enviar).toHaveBeenCalledTimes(1);
    expect(a.replay).toBe(false);
    expect(b.replay).toBe(true);
    expect(b.message.id).toBe(a.message.id);
  });

  it("B — chaves DIFERENTES, mesmo usuário/conversa/texto (Enter duas vezes): envia UMA vez", async () => {
    const arm = armazemEmMemoria();
    const w = mundo();
    await envioUnico({ ...base, idempotencyKey: "k-1" }, arm, w.enviar, w.buscar);
    const b = await envioUnico({ ...base, idempotencyKey: "k-2" }, arm, w.enviar, w.buscar);
    expect(w.enviar).toHaveBeenCalledTimes(1);
    expect(b.replay).toBe(true);
  });

  it("duas requisições SIMULTÂNEAS (duplo clique) enviam uma vez só", async () => {
    const arm = armazemEmMemoria();
    const w = mundo();
    const lenta = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 40));
      return w.enviar();
    });
    const [a, b] = await Promise.all([
      envioUnico({ ...base, idempotencyKey: "k-1" }, arm, lenta, w.buscar),
      envioUnico({ ...base, idempotencyKey: "k-2" }, arm, lenta, w.buscar),
    ]);
    expect(lenta).toHaveBeenCalledTimes(1);
    expect(a.message.id).toBe(b.message.id);
  });

  it("controle: depois da janela, o MESMO texto sai de novo (nada é barrado para sempre)", async () => {
    let agora = 1_000_000;
    const arm = armazemEmMemoria(() => agora);
    const w = mundo();
    await envioUnico({ ...base, idempotencyKey: "k-1" }, arm, w.enviar, w.buscar);
    agora += (JANELA_SEGUNDOS + 1) * 1000;
    const b = await envioUnico({ ...base, idempotencyKey: "k-2" }, arm, w.enviar, w.buscar);
    expect(w.enviar).toHaveBeenCalledTimes(2);
    expect(b.replay).toBe(false);
  });

  it("controle: texto DIFERENTE, outra conversa ou outro usuário não são repetição", async () => {
    const arm = armazemEmMemoria();
    const w = mundo();
    await envioUnico({ ...base, idempotencyKey: "k-1" }, arm, w.enviar, w.buscar);
    await envioUnico({ ...base, idempotencyKey: "k-2", body: "outro texto" }, arm, w.enviar, w.buscar);
    await envioUnico({ ...base, idempotencyKey: "k-3", conversationId: "c-2" }, arm, w.enviar, w.buscar);
    await envioUnico({ ...base, idempotencyKey: "k-4", userId: "u-2" }, arm, w.enviar, w.buscar);
    expect(w.enviar).toHaveBeenCalledTimes(4);
  });

  it("mídia: a mesma imagem em seguida NÃO cai na janela (só texto tem janela)", async () => {
    const arm = armazemEmMemoria();
    const w = mundo();
    const img = { ...base, type: "image", body: "legenda" };
    await envioUnico({ ...img, idempotencyKey: "k-1" }, arm, w.enviar, w.buscar);
    await envioUnico({ ...img, idempotencyKey: "k-2" }, arm, w.enviar, w.buscar);
    expect(w.enviar).toHaveBeenCalledTimes(2);
  });

  it("envio que FALHA libera a reserva: o reenvio sai", async () => {
    const arm = armazemEmMemoria();
    const w = mundo();
    const falha = vi.fn(async (): Promise<Msg> => {
      throw new Error("waha fora");
    });
    await expect(envioUnico(base, arm, falha, w.buscar)).rejects.toThrow("waha fora");
    const b = await envioUnico(base, arm, w.enviar, w.buscar);
    expect(w.enviar).toHaveBeenCalledTimes(1);
    expect(b.replay).toBe(false);
  });

  it("mensagem que volta com status 'failed' também libera a reserva", async () => {
    const arm = armazemEmMemoria();
    const w = mundo();
    const falhou = vi.fn(async (): Promise<Msg> => ({ id: "m-x", status: "failed" }));
    await envioUnico(base, arm, falhou, w.buscar);
    const b = await envioUnico(base, arm, w.enviar, w.buscar);
    expect(b.replay).toBe(false);
    expect(w.enviar).toHaveBeenCalledTimes(1);
  });

  it("armazém fora do ar NÃO derruba o envio (sem proteção, mas sem erro)", async () => {
    const quebrado = {
      setNx: async () => {
        throw new Error("redis fora");
      },
      get: async () => null,
      set: async () => {
        throw new Error("redis fora");
      },
      del: async () => undefined,
    };
    const w = mundo();
    const a = await envioUnico(base, quebrado, w.enviar, w.buscar);
    expect(a.replay).toBe(false);
    expect(w.enviar).toHaveBeenCalledTimes(1);
  });

  it("repetição de um envio que não terminou dentro da espera vira 409, sem enviar", async () => {
    const arm = armazemEmMemoria();
    const w = mundo();
    await arm.setNx("envio:org-1:u-1:idem:k-1", "pendente", 60);
    const p = envioUnico(base, arm, w.enviar, w.buscar, { esperaMaximaMs: 300, requestId: "r1" });
    await expect(p).rejects.toBeInstanceOf(ApiError);
    await expect(p).rejects.toMatchObject({ status: 409, code: "duplicate_send_in_flight" });
    expect(w.enviar).not.toHaveBeenCalled();
  });
});
