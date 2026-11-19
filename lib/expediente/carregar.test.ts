/**
 * `carregarExpediente` falha aberto, mas a falha não pode ser muda: linha ausente sem erro é o
 * sintoma de a RLS esconder a organização (review do #88, item 2) e precisa deixar rastro.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const warn = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { warn: (...a: unknown[]) => warn(...a) } }));

import { carregarExpediente } from "./carregar";

const ORG = "22222222-2222-4222-8222-222222222222";
const comercial = {
  timezone: "America/Sao_Paulo",
  windows: [{ dow: 1, start: "08:00", end: "18:00" }],
};

function db(resposta: { data: unknown; error: { message: string } | null }): SupabaseClient {
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => resposta }) }) }),
  } as unknown as SupabaseClient;
}

beforeEach(() => vi.clearAllMocks());

describe("carregarExpediente", () => {
  it("lê o expediente da organização", async () => {
    const r = await carregarExpediente(db({ data: { settings: { business_hours: comercial } }, error: null }), ORG);
    expect(r).toEqual(comercial);
    expect(warn).not.toHaveBeenCalled();
  });

  it("organização SEM business_hours é normal: null e nenhum warn", async () => {
    expect(await carregarExpediente(db({ data: { settings: {} }, error: null }), ORG)).toBeNull();
    expect(await carregarExpediente(db({ data: { settings: null }, error: null }), ORG)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("linha AUSENTE sem erro (RLS escondendo): falha aberto E registra warn", async () => {
    expect(await carregarExpediente(db({ data: null, error: null }), ORG)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![1]).toMatchObject({ organization_id: ORG });
  });

  it("erro do banco: falha aberto e warn (o de antes)", async () => {
    expect(await carregarExpediente(db({ data: null, error: { message: "offline" } }), ORG)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![1]).toMatchObject({ error: "offline" });
  });

  it("cliente que lança: falha aberto, warn, nunca lança", async () => {
    const quebrado = { from: () => { throw new Error("boom"); } } as unknown as SupabaseClient;
    await expect(carregarExpediente(quebrado, ORG)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
