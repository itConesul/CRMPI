import { beforeEach, describe, expect, it, vi } from "vitest";

import { webPushInboundHandler } from "./push.handler";

const { vapid, enviarPushAoUsuario, redirect } = vi.hoisted(() => ({
  vapid: { pronto: false },
  enviarPushAoUsuario: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/notifications/vapid", () => ({
  vapidPronto: () => vapid.pronto,
}));
vi.mock("./web_push", () => ({
  enviarPushAoUsuario,
  enviarPushDaOrg: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect }));

beforeEach(() => {
  vapid.pronto = false;
  enviarPushAoUsuario.mockReset();
  redirect.mockReset();
});

describe("webPushInboundHandler", () => {
  it("pula quando VAPID não está configurado", async () => {
    const result = await webPushInboundHandler.handle({
      id: "e1",
      organization_id: "org",
      event_type: "message.received",
      entity_kind: "message",
      entity_id: "m1",
      payload: { conversation_id: "c1", body_preview: "oi", type: "text" },
      metadata: {},
      consumed_by: [],
      attempts: 0,
    });
    expect(result.status).toBe("skipped");
    expect(result.detail).toBe("vapid_ausente");
  });
});

// Spec #69, T5 / CA-10 (RF-6): o aviso de menção, ao ser clicado, abre a conversa citada.
// O `href` que o push monta tem de cair numa rota que EXISTE e que leva a `/app/inbox?id=<id>`.
// Este teste exercita a rota de verdade (a página do deep link), não só a presença do arquivo.
describe("push de user.mentioned — o href abre a conversa citada (CA-10)", () => {
  const ID_DA_CONVERSA = "11111111-2222-4333-8444-555555555555";

  function eventoDeMencao(payload: Record<string, unknown>) {
    return {
      id: "e2",
      organization_id: "org-1",
      event_type: "user.mentioned",
      entity_kind: "conversation_note",
      entity_id: "n1",
      payload,
      metadata: {},
      consumed_by: [],
      attempts: 0,
    };
  }

  it("monta o href com o id da conversa e o entrega ao destinatário da menção", async () => {
    vapid.pronto = true;
    enviarPushAoUsuario.mockResolvedValue({ sent: 1 });

    const result = await webPushInboundHandler.handle(
      eventoDeMencao({ to_user_id: "u-b", conversation_id: ID_DA_CONVERSA, body_preview: "oi @Beto" }),
    );

    expect(result.status).toBe("ok");
    expect(enviarPushAoUsuario).toHaveBeenCalledTimes(1);
    const [org, userId, payload] = enviarPushAoUsuario.mock.calls[0]!;
    expect(org).toBe("org-1");
    expect(userId).toBe("u-b");
    expect(payload).toMatchObject({ title: "Você foi mencionado", href: `/app/inbox/${ID_DA_CONVERSA}` });
  });

  it("o href resolve numa rota que existe e redireciona para /app/inbox?id=<id>", async () => {
    vapid.pronto = true;
    enviarPushAoUsuario.mockResolvedValue({ sent: 1 });
    await webPushInboundHandler.handle(
      eventoDeMencao({ to_user_id: "u-b", conversation_id: ID_DA_CONVERSA, body_preview: "oi" }),
    );
    const { href } = enviarPushAoUsuario.mock.calls[0]![2] as { href: string };

    // O segmento dinâmico da URL que o push entregou vira o `params.id` da página do deep link.
    const m = /^\/app\/inbox\/([^/?#]+)$/.exec(href);
    expect(m, `o href ${href} não tem a forma /app/inbox/<id>`).not.toBeNull();

    const { default: InboxDeepLink } = await import("@/app/app/inbox/[id]/page");
    await InboxDeepLink({ params: Promise.resolve({ id: m![1]! }) });

    expect(redirect).toHaveBeenCalledWith(`/app/inbox?id=${ID_DA_CONVERSA}`);
  });

  it("sem conversation_id cai na caixa de entrada, sem id inventado", async () => {
    vapid.pronto = true;
    enviarPushAoUsuario.mockResolvedValue({ sent: 1 });
    await webPushInboundHandler.handle(eventoDeMencao({ to_user_id: "u-b", body_preview: "oi" }));
    expect(enviarPushAoUsuario.mock.calls[0]![2]).toMatchObject({ href: "/app/inbox" });
  });

  it("sem destinatário não envia nada", async () => {
    vapid.pronto = true;
    const result = await webPushInboundHandler.handle(
      eventoDeMencao({ conversation_id: ID_DA_CONVERSA, body_preview: "oi" }),
    );
    expect(result).toMatchObject({ status: "skipped", detail: "sem_destinatario" });
    expect(enviarPushAoUsuario).not.toHaveBeenCalled();
  });
});
