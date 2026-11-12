import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O cliente Supabase do navegador é ANÔNIMO (cookie de sessão httpOnly): qualquer
// uso dele para ler `contacts` volta 401. O teste reprova se o aviso o tocar.
const supabaseDoBrowser = vi.fn(() => {
  throw new Error("o aviso não pode ler contacts pelo Supabase do navegador");
});
vi.mock("@/lib/supabase/browser", () => ({ createClient: supabaseDoBrowser }));

const apiGet = vi.fn();
vi.mock("@/lib/api/client", () => ({ apiClient: { get: apiGet } }));

const { contactNotifyBits } = await import("@/hooks/notifications/useInboundMessageAlerts");

const ID = "97426186-eb54-4e94-a53b-43504d62564d";
const ORIGEM = "http://192.168.0.112:3000";

describe("aviso de mensagem nova: nome e foto do contato", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("window", { location: { origin: ORIGEM } });
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("o nome vem da rota do app, nunca do Supabase do navegador", async () => {
    apiGet.mockResolvedValue({ data: { display_name: "Maria Souza", name: null } });
    fetchSpy.mockResolvedValue({ ok: false, url: "" });

    const bits = await contactNotifyBits(ID);

    expect(bits.title).toBe("Maria Souza");
    expect(apiGet).toHaveBeenCalledWith(`/api/v1/contacts/${ID}`);
    expect(supabaseDoBrowser).not.toHaveBeenCalled();
  });

  it("a foto é buscada SEM credentials:'include' (o redirect do Storage responde ACAO:*)", async () => {
    apiGet.mockResolvedValue({ data: { display_name: "Maria" } });
    fetchSpy.mockResolvedValue({
      ok: true,
      url: "https://x.supabase.co/storage/v1/object/sign/whatsapp-media/o/avatars/a.jpg?token=t",
    });

    const bits = await contactNotifyBits(ID);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe(`/api/v1/contacts/${ID}/avatar`);
    expect(init?.credentials).not.toBe("include");
    expect(bits.icon).toContain("supabase.co/storage");
  });

  it("controle: se a leitura do nome falha, o aviso sai genérico e a foto segue", async () => {
    apiGet.mockRejectedValue(new Error("falhou"));
    fetchSpy.mockResolvedValue({ ok: false, url: "" });

    const bits = await contactNotifyBits(ID);

    expect(bits.title).toBe("Nova mensagem");
  });

  it("identificador técnico NUNCA vira o título do aviso: usa o telefone", async () => {
    apiGet.mockResolvedValue({
      data: { display_name: "Contato 543134@lid", name: null, phone_number: "+5531988887777" },
    });
    fetchSpy.mockResolvedValue({ ok: false, url: "" });

    const bits = await contactNotifyBits(ID);

    expect(bits.title).toBe("+5531988887777");
    expect(bits.title).not.toMatch(/@lid/);
  });

  it("sem nome e sem telefone, o aviso sai genérico (não 'Sem nome')", async () => {
    apiGet.mockResolvedValue({ data: { display_name: null, name: null, phone_number: null } });
    fetchSpy.mockResolvedValue({ ok: false, url: "" });

    expect((await contactNotifyBits(ID)).title).toBe("Nova mensagem");
  });

});
