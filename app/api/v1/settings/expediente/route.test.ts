/**
 * `/api/v1/settings/expediente` (PRD-01 / #67): quem lê, quem grava, o que é validado, o merge não
 * destrutivo do `settings` e o audit. Os mocks seguem o padrão de `lib/auth/require-role.test.ts`.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { lerBarradosDoDia } from "@/lib/expediente/contador";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { GET, PATCH } from "./route";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/expediente/contador", () => ({ lerBarradosDoDia: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";

const comercial = {
  timezone: "America/Sao_Paulo",
  windows: [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "08:00", end: "18:00" })),
};

function liberar() {
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: USER } as never,
    org: { orgId: ORG, name: "Org", role: "admin" },
  });
}

/** Um client que devolve `settings` na leitura e registra o que foi gravado. */
function clienteComSettings(settings: unknown) {
  const gravado: { settings?: unknown; orgId?: string } = {};
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { settings }, error: null }) }),
      }),
      update: (valores: { settings: unknown }) => ({
        eq: async (_col: string, id: string) => {
          gravado.settings = valores.settings;
          gravado.orgId = id;
          return { error: null };
        },
      }),
    }),
  };
  return { client: client as never, gravado };
}

const get = () => new NextRequest("http://localhost/api/v1/settings/expediente");
const patch = (corpo: unknown) =>
  new NextRequest("http://localhost/api/v1/settings/expediente", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });

beforeEach(() => {
  vi.clearAllMocks();
  liberar();
});

describe("GET — lê o expediente e o estado avaliado pelo servidor", () => {
  it("exige só o PISO (`viewer`): a faixa do shell chama a rota para todo usuário logado", async () => {
    // Regressão medida na CI (suporte-temporario.spec.ts): com `agent` aqui, o `viewer` e o suporte
    // somente-leitura levavam 403 a cada carga de tela, e cada 403 por papel grava `authz.denied`.
    const { client } = clienteComSettings({ business_hours: comercial });
    vi.mocked(createClient).mockResolvedValue(client);
    await GET(get());
    expect(vi.mocked(requireRole).mock.calls[0]![0]).toBe("viewer");
  });

  it("devolve a config, `dentro`, `opens_at` e o `agora` do servidor", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T22:00:00-03:00"));
    const { client } = clienteComSettings({ business_hours: comercial, routing: { mode: "manual" } });
    vi.mocked(createClient).mockResolvedValue(client);
    const res = await GET(get());
    vi.useRealTimers();
    const { data } = (await res.json()) as { data: Record<string, unknown> };
    expect(res.status).toBe(200);
    expect(data).toMatchObject({ configurado: true, restringe: true, dentro: false });
    expect(data.opens_at).toBe(new Date("2026-07-14T08:00:00-03:00").toISOString());
  });

  it("sem expediente: não restringe", async () => {
    const { client } = clienteComSettings({});
    vi.mocked(createClient).mockResolvedValue(client);
    const { data } = (await (await GET(get())).json()) as { data: Record<string, unknown> };
    expect(data).toMatchObject({ configurado: false, restringe: false, dentro: true });
  });

  it("devolve a resposta do gate quando o papel não basta", async () => {
    vi.mocked(requireRole).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) as never });
    expect((await GET(get())).status).toBe(403);
  });
});

describe("GET — `barrados_hoje` (RNF-5, opção (b); contrato em `02-design.md` §2.1)", () => {
  const comPapel = (role: "viewer" | "agent" | "manager" | "admin") =>
    vi.mocked(requireRole).mockResolvedValue({
      ok: true,
      user: { id: USER } as never,
      org: { orgId: ORG, name: "Org", role },
    });
  const lerCom = async (settings: unknown) => {
    const { client } = clienteComSettings(settings);
    vi.mocked(createClient).mockResolvedValue(client);
    const res = await GET(get());
    const { data } = (await res.json()) as { data: Record<string, unknown> };
    return { res, data };
  };

  it.each(["admin", "manager"] as const)("`%s` recebe o número, no fuso da organização", async (papel) => {
    comPapel(papel);
    vi.mocked(lerBarradosDoDia).mockResolvedValue(7);
    const { res, data } = await lerCom({ business_hours: comercial });
    expect(res.status).toBe(200);
    expect(data.barrados_hoje).toBe(7);
    expect(vi.mocked(lerBarradosDoDia)).toHaveBeenCalledWith(ORG, "America/Sao_Paulo");
  });

  it.each(["agent", "viewer"] as const)(
    "`%s` recebe `null` e o Redis NÃO é consultado (a faixa chama a rota de todo usuário a cada 60 s)",
    async (papel) => {
      comPapel(papel);
      vi.mocked(lerBarradosDoDia).mockResolvedValue(7);
      const { data } = await lerCom({ business_hours: comercial });
      expect(data.barrados_hoje).toBeNull();
      expect(vi.mocked(lerBarradosDoDia)).not.toHaveBeenCalled();
    },
  );

  it("`0` é um número: o Redis respondeu e nenhuma tentativa foi barrada hoje (a tela mostra `0`, não `—`)", async () => {
    comPapel("manager");
    vi.mocked(lerBarradosDoDia).mockResolvedValue(0);
    const { data } = await lerCom({ business_hours: comercial });
    expect(data.barrados_hoje).toBe(0);
  });

  it("Redis fora (a leitura devolve `null`): a rota responde 200 com `null`, não falha", async () => {
    comPapel("admin");
    vi.mocked(lerBarradosDoDia).mockResolvedValue(null);
    const { res, data } = await lerCom({ business_hours: comercial });
    expect(res.status).toBe(200);
    expect(data.barrados_hoje).toBeNull();
    expect(data.configurado).toBe(true); // o resto da resposta segue intacto
  });

  it.each([
    ["sem expediente configurado", {}],
    ["expediente inválido", { business_hours: { timezone: "Marte/Olimpo", windows: "nada" } }],
  ])("%s: `null`, sem consulta (não há fuso da organização para dizer qual é \"hoje\")", async (_rotulo, settings) => {
    comPapel("admin");
    vi.mocked(lerBarradosDoDia).mockResolvedValue(7);
    const { data } = await lerCom(settings);
    expect(data.barrados_hoje).toBeNull();
    expect(vi.mocked(lerBarradosDoDia)).not.toHaveBeenCalled();
  });

  it("o campo existe sempre (`null`, nunca ausente): a tela da T6 não precisa distinguir `undefined`", async () => {
    comPapel("viewer");
    const { data } = await lerCom({ business_hours: comercial });
    expect(Object.prototype.hasOwnProperty.call(data, "barrados_hoje")).toBe(true);
  });
});

describe("PATCH — só `admin`, valida, preserva o resto do settings e audita", () => {
  it("exige `admin`", async () => {
    const { client } = clienteComSettings({});
    vi.mocked(createAdminClient).mockReturnValue(client);
    await PATCH(patch(comercial));
    expect(vi.mocked(requireRole).mock.calls[0]![0]).toBe("admin");
  });

  it("grava `business_hours` e PRESERVA `routing`, `visibility_mode`, `branding` e `security`", async () => {
    const { client, gravado } = clienteComSettings({
      routing: { mode: "round_robin" },
      visibility_mode: "own",
      branding: { name: "Acme" },
      security: { mfa_required: true },
    });
    vi.mocked(createAdminClient).mockReturnValue(client);
    const res = await PATCH(patch(comercial));
    expect(res.status).toBe(200);
    expect(gravado.orgId).toBe(ORG);
    expect(gravado.settings).toEqual({
      routing: { mode: "round_robin" },
      visibility_mode: "own",
      branding: { name: "Acme" },
      security: { mfa_required: true },
      business_hours: comercial,
    });
  });

  it("aceita virada de dia (22:00–06:00) e `windows` vazio (sem restrição)", async () => {
    for (const corpo of [
      { timezone: "America/Sao_Paulo", windows: [{ dow: 1, start: "22:00", end: "06:00" }] },
      { timezone: "America/Sao_Paulo", windows: [] },
    ]) {
      const { client } = clienteComSettings({});
      vi.mocked(createAdminClient).mockReturnValue(client);
      expect((await PATCH(patch(corpo))).status, JSON.stringify(corpo)).toBe(200);
    }
  });

  it("recusa fuso inexistente, `start == end`, `dow` fora de 0–6 e hora torta — e NÃO grava", async () => {
    for (const corpo of [
      { timezone: "Marte/Olympus", windows: [] },
      { timezone: "America/Sao_Paulo", windows: [{ dow: 1, start: "08:00", end: "08:00" }] },
      { timezone: "America/Sao_Paulo", windows: [{ dow: 9, start: "08:00", end: "18:00" }] },
      { timezone: "America/Sao_Paulo", windows: [{ dow: 1, start: "8h", end: "18:00" }] },
    ]) {
      const { client, gravado } = clienteComSettings({});
      vi.mocked(createAdminClient).mockReturnValue(client);
      const res = await PATCH(patch(corpo));
      expect(res.status, JSON.stringify(corpo)).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(gravado.settings, "nada pode ser gravado").toBeUndefined();
    }
    expect(vi.mocked(audit)).not.toHaveBeenCalled();
  });

  it("audita `expediente.config_changed` com o valor anterior e o novo, e só quando gravou", async () => {
    const { client } = clienteComSettings({});
    vi.mocked(createAdminClient).mockReturnValue(client);
    await PATCH(patch(comercial));
    expect(vi.mocked(audit)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(audit).mock.calls[0]![0]).toMatchObject({
      action: "expediente.config_changed",
      actorUserId: USER,
      organizationId: ORG,
      metadata: { timezone: "America/Sao_Paulo", windows: 5, previous: null, new: comercial },
    });
  });

  it("o audit carrega o expediente ANTERIOR quando já havia um", async () => {
    const anterior = { timezone: "America/Sao_Paulo", windows: [{ dow: 1, start: "09:00", end: "12:00" }] };
    const { client } = clienteComSettings({ business_hours: anterior });
    vi.mocked(createAdminClient).mockReturnValue(client);
    await PATCH(patch(comercial));
    expect(vi.mocked(audit).mock.calls[0]![0]).toMatchObject({
      metadata: { previous: anterior, new: comercial },
    });
  });
});
