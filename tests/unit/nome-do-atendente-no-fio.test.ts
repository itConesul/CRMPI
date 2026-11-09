import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import type { SendMessageInput } from "@/lib/schemas";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ storage: { from: () => ({ createSignedUrl: vi.fn() }) } }),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));

/**
 * O CLIENTE VÊ QUEM ESTÁ FALANDO — e o CRM continua se reconhecendo no eco.
 *
 * Mensagem de TEXTO escrita por uma pessoa sai do canal como `*Nome:*` + quebra
 * de linha + texto. O que está guardado em `messages.body` NÃO muda (o Inbox já
 * desenha o nome acima da bolha; gravar o prefixo também o repetiria).
 *
 * O lado do reconhecimento do eco (`ehEcoDeEnvioNosso`) tem o caso dele em
 * `eco-do-envio-nao-silencia-o-bot.test.ts`.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";
const CONTACT = "33333333-3333-4333-8333-333333333333";
const SESSION = "44444444-4444-4444-8444-444444444444";
const USER = "55555555-5555-4555-8555-555555555555";

type Row = Record<string, unknown>;

function makeSupabase(nomeDoUsuario: string | null) {
  const messages: Row[] = [];
  const conversa = {
    id: CONV,
    organization_id: ORG,
    contact_id: CONTACT,
    channel_session_id: SESSION,
    is_group: false,
    group_chat_id: null,
    contacts: { phone_number: "+5531999998888", wa_identity: null, is_blocked: false },
    channel_sessions: { provider: "waha", waha_session_name: "default", status: "WORKING" },
  };
  const from = (table: string) => {
    if (table === "conversations") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: conversa, error: null }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    }
    if (table === "contacts") {
      const c: Record<string, unknown> = {
        eq: () => c,
        then: (r: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(r),
      };
      return { update: () => c } as never;
    }
    if (table !== "messages") throw new Error(`fake: tabela inesperada '${table}'`);
    return {
      insert: (row: Row) => {
        // O trigger `fn_messages_nome_do_autor` (migration 0234) preenche o nome
        // no INSERT quando há `sent_by_user_id`; o dublê faz o mesmo.
        const nova: Row = {
          id: `msg-${messages.length + 1}`,
          external_id: null,
          ...row,
          sent_by_user_name: row.sent_by_user_id ? nomeDoUsuario : null,
        };
        messages.push(nova);
        return { select: () => ({ single: async () => ({ data: { ...nova }, error: null }) }) };
      },
      update: (patch: Row) => {
        const q = {
          eq: () => q,
          select: () => {
            const resolver = async () => {
              Object.assign(messages[0]!, patch);
              return { data: { ...messages[0] }, error: null };
            };
            return { maybeSingle: resolver, single: resolver };
          },
        };
        return q;
      },
      delete: () => {
        const q: Record<string, unknown> = {
          eq: () => q,
          neq: () => q,
          in: () => q,
          then: (r: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(r),
        };
        return q;
      },
    };
  };
  return {
    supabase: { from, rpc: async () => ({ error: null }) } as unknown as SupabaseClient,
    messages,
  };
}

function wahaCapturando() {
  vi.stubEnv("WAHA_API_BASE_URL", "http://localhost:3030");
  vi.stubEnv("WAHA_API_KEY", "hash123");
  const corpos: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: { body?: string }) => {
      if (init?.body) corpos.push(JSON.parse(init.body) as Record<string, unknown>);
      return new Response(JSON.stringify({ id: { id: "3EB0XYZ" } }), { status: 200 });
    }),
  );
  return corpos;
}

const ctxPessoa: HandlerCtx = { organization_id: ORG, actor: { type: "user", id: USER }, requestId: "req-1" };
const texto = (body: string) => ({ conversation_id: CONV, type: "text", body }) as SendMessageInput;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("nome do atendente no fio do WhatsApp", () => {
  it("⭐ texto de pessoa sai como `*Nome:*` + quebra de linha + texto", async () => {
    const corpos = wahaCapturando();
    const { supabase } = makeSupabase("Maria Souza");

    await sendMessageHandler(supabase, ctxPessoa, texto("Bom dia, tudo bem?"));

    expect(corpos.map((c) => c.text)).toEqual(["*Maria Souza:*\nBom dia, tudo bem?"]);
  });

  it("⭐ o que fica gravado em messages.body é SÓ o que a pessoa digitou", async () => {
    wahaCapturando();
    const { supabase, messages } = makeSupabase("Maria Souza");

    await sendMessageHandler(supabase, ctxPessoa, texto("Bom dia, tudo bem?"));

    expect(messages[0]!.body).toBe("Bom dia, tudo bem?");
    expect(messages[0]!.sent_by_user_name).toBe("Maria Souza");
  });

  it("outra pessoa na mesma conversa: o nome da bolha é o dela", async () => {
    const corpos = wahaCapturando();
    const maria = makeSupabase("Maria Souza");
    await sendMessageHandler(maria.supabase, ctxPessoa, texto("Vou verificar."));
    const joao = makeSupabase("João Lima");
    await sendMessageHandler(joao.supabase, ctxPessoa, texto("Já resolvi."));

    expect(corpos.map((c) => c.text)).toEqual(["*Maria Souza:*\nVou verificar.", "*João Lima:*\nJá resolvi."]);
  });

  it("sem nome cadastrado, o texto sai intacto — não inventa 'Atendente'", async () => {
    const corpos = wahaCapturando();
    const { supabase } = makeSupabase(null);

    await sendMessageHandler(supabase, ctxPessoa, texto("oi"));

    expect(corpos.map((c) => c.text)).toEqual(["oi"]);
  });
});
