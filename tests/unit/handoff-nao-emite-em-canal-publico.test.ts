/**
 * O handoff NÃO publica nada num canal Realtime de broadcast.
 *
 * Por quê: `triggerHandoff` enviava `{ conversation_id, reason }` em
 * `org:<org>:queue`, um canal PÚBLICO (sem `private: true`, sem política em
 * `realtime.messages`). Na sonda do PR #91 (T0(b)), um cliente anônimo — só com
 * a anon key, que vai para o navegador — recebeu o payload de qualquer
 * organização cujo id soubesse. Nenhum código do app assinava o canal, então o
 * envio só expunha, e não servia a ninguém.
 *
 * Duas camadas, de propósito:
 *  1. COMPORTAMENTO — rodar `triggerHandoff` e provar que o client admin nunca
 *     abre canal nem envia broadcast.
 *  2. VARREDURA — nenhum código de servidor emite `type: "broadcast"`. Um canal
 *     de broadcast, se um dia for preciso, nasce privado, com autorização, e
 *     entra aqui como exceção com motivo escrito (hoje a lista é VAZIA).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const CONV = "44444444-4444-4444-8444-444444444444";
const ORG = "22222222-2222-4222-8222-222222222222";
const CONTACT = "66666666-6666-4666-8666-666666666666";

const channel = vi.fn();
const send = vi.fn();

vi.mock("@/lib/ai/handoff/aviso-ao-lead", () => ({
  avisarLeadDoCrm: vi.fn(async () => ({ avisado: true })),
}));
vi.mock("@/lib/ai/elegibilidade/consulta-supabase", () => ({
  decidirElegibilidadeDaConversaViaSupabase: vi.fn(async () => ({
    permite: true,
    motivo: "autorizado",
    bloqueioPorAllowlist: false,
  })),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(), isServiceRoleConfigured: () => false }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: () => chain,
      update: () => chain,
      insert: () => chain,
      eq: () => chain,
      maybeSingle: () =>
        Promise.resolve({
          data: { id: CONV, organization_id: ORG, contact_id: CONTACT, last_handoff_at: null, last_handoff_reason: null },
          error: null,
        }),
      then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r),
    };
    return {
      from: () => chain,
      rpc: () => Promise.resolve({ error: null }),
      channel: (...a: unknown[]) => {
        channel(...a);
        return { send: (...s: unknown[]) => send(...s), subscribe: () => ({}) };
      },
      removeChannel: () => Promise.resolve(),
    };
  },
}));

import { triggerHandoff } from "@/lib/ai/handoff/orchestrator";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("triggerHandoff · não publica em canal Realtime público", () => {
  it("o handoff dispara, mas o client admin não abre canal nem envia broadcast", async () => {
    const r = await triggerHandoff({ conversationId: CONV, organizationId: ORG, reason: "requested_human" });
    // Prova que o caminho rodou até o fim (senão o "nunca chamou" seria vazio).
    expect(r.triggered).toBe(true);
    expect(channel).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Varredura — nenhum emissor de broadcast no código de servidor.
// ---------------------------------------------------------------------------

const RAIZ = process.cwd();
const PASTAS = ["app", "lib", "workers"];
const IGNORA = new Set(["node_modules", ".next", ".git"]);

/** Exceções com MOTIVO escrito. Vazia: nenhum broadcast de servidor é permitido. */
const EXCECOES: Record<string, string> = {};

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (IGNORA.has(nome)) continue;
    const caminho = join(dir, nome);
    const st = statSync(caminho);
    if (st.isDirectory()) arquivos(caminho, acc);
    else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.(ts|tsx)$/.test(nome)) acc.push(caminho);
  }
  return acc;
}

/** Tira comentários, para que o texto explicando o defeito não o reprove. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("varredura · nenhum emissor de broadcast no servidor", () => {
  const emissores = PASTAS.flatMap((p) => arquivos(join(RAIZ, p)))
    .map((f) => relative(RAIZ, f).replace(/\\/g, "/"))
    .filter((f) => !(f in EXCECOES))
    .filter((f) => /type:\s*["']broadcast["']/.test(semComentarios(readFileSync(join(RAIZ, f), "utf8"))));

  it("nenhum arquivo de app/, lib/ ou workers/ envia `type: \"broadcast\"`", () => {
    expect(emissores).toEqual([]);
  });

  it("o canal `org:<org>:queue` não é mais referenciado em código", () => {
    const usam = PASTAS.flatMap((p) => arquivos(join(RAIZ, p)))
      .map((f) => relative(RAIZ, f).replace(/\\/g, "/"))
      .filter((f) => /:queue`|:queue["']/.test(semComentarios(readFileSync(join(RAIZ, f), "utf8"))));
    expect(usam).toEqual([]);
  });
});
