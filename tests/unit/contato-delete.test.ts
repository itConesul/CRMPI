import { beforeEach, describe, expect, it, vi } from "vitest";

const auditSpy = vi.fn(async () => undefined);

vi.mock("@/lib/audit", () => ({
  audit: auditSpy,
  isServiceRoleConfigured: () => false,
  hashEmail: (e: string) => e,
}));

const ORG = "c05e7a00-0000-4000-8000-000000000001";
const CONTATO = "c05e7a00-0000-4000-8000-0000000000c1";
const USUARIO = "c05e7a00-0000-4000-8000-0000000000a1";

const chamadas: Array<{ tabela: string; op: string }> = [];

/**
 * Cliente falso. `fk` simula o que o BANCO devolve ao apagar `contacts` quando há histórico: o
 * `23503` de uma FK `RESTRICT`. A constraint vem na mensagem do erro, como no Postgres (medido na
 * spec da #99, `02-design.md` §2): o handler NÃO deve ler esse nome para escolher o texto.
 */
function clienteFalso(opts?: { missing?: boolean; fk?: string }): unknown {
  return {
    from: (tabela: string) => {
      const del = {
        eq: () => del,
        select: () => del,
        maybeSingle: async () =>
          opts?.fk
            ? {
                data: null,
                error: {
                  code: "23503",
                  message: `update or delete on table "contacts" violates foreign key constraint "${opts.fk}"`,
                },
              }
            : opts?.missing
              ? { data: null, error: null }
              : { data: { id: CONTATO }, error: null },
      };
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () =>
                opts?.missing
                  ? { data: null, error: null }
                  : { data: { id: CONTATO, organization_id: ORG }, error: null },
            }),
          }),
        }),
        delete: () => {
          chamadas.push({ tabela, op: "delete" });
          return del;
        },
      };
    },
    rpc: () => ({ then: (r: (v: unknown) => unknown) => r({ error: null }) }),
  };
}

const CTX = { organization_id: ORG, actor: { type: "user" as const, id: USUARIO }, requestId: "req-1" };

describe("deleteContactHandler", () => {
  beforeEach(() => {
    auditSpy.mockClear();
    chamadas.length = 0;
  });

  // CA-4: contato sem conversa e sem compromisso.
  it("apaga SÓ o contato (nunca messages nem conversations) e audita", async () => {
    const { deleteContactHandler } = await import("@/app/api/v1/contacts/_handler");
    const out = await deleteContactHandler(clienteFalso() as never, CTX, CONTATO);
    expect(out).toEqual({ id: CONTATO });
    expect(chamadas.map((c) => c.tabela)).toEqual(["contacts"]);
    const ultima = (auditSpy.mock.calls.at(-1) as unknown as [Record<string, unknown>] | undefined)?.[0];
    expect(ultima).toMatchObject({
      action: "contact.deleted",
      resourceId: CONTATO,
      organizationId: ORG,
    });
  });

  // CA-3: contato com conversa. O banco decide (FK RESTRICT); o handler traduz em 409.
  it("409 state_conflict quando o banco recusa por FK (conversa), mandando pedir a um administrador", async () => {
    const { deleteContactHandler } = await import("@/app/api/v1/contacts/_handler");
    const erro = await deleteContactHandler(
      clienteFalso({ fk: "conversations_contact_id_fkey" }) as never,
      CTX,
      CONTATO,
    ).catch((e: unknown) => e);
    expect(erro).toMatchObject({ status: 409, code: "state_conflict" });
    expect((erro as Error).message).toContain("administrador");
    // O histórico NÃO é tocado: só a tentativa de apagar o contato, e nada é auditado (não é mutação).
    expect(chamadas.map((c) => c.tabela)).toEqual(["contacts"]);
    expect(auditSpy).not.toHaveBeenCalled();
  });

  // CA-3b: contato SÓ com compromisso. Mesma resposta, mesmo texto: a saída é a mesma (anonimizar).
  it("409 com o MESMO texto quando a causa é compromisso (calendar_appointments_contact_id_fkey)", async () => {
    const { deleteContactHandler } = await import("@/app/api/v1/contacts/_handler");
    const porConversa = await deleteContactHandler(
      clienteFalso({ fk: "conversations_contact_id_fkey" }) as never,
      CTX,
      CONTATO,
    ).catch((e: unknown) => e);
    chamadas.length = 0;
    const porCompromisso = await deleteContactHandler(
      clienteFalso({ fk: "calendar_appointments_contact_id_fkey" }) as never,
      CTX,
      CONTATO,
    ).catch((e: unknown) => e);
    expect(porCompromisso).toMatchObject({ status: 409, code: "state_conflict" });
    expect((porCompromisso as Error).message).toBe((porConversa as Error).message);
    expect((porCompromisso as Error).message).toContain("administrador");
    expect(chamadas.map((c) => c.tabela)).toEqual(["contacts"]);
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it("o texto do 409 existe em espanhol", async () => {
    const { deleteContactHandler } = await import("@/app/api/v1/contacts/_handler");
    const erro = await deleteContactHandler(
      clienteFalso({ fk: "messages_contact_id_fkey" }) as never,
      { ...CTX, idioma: "es" },
      CONTATO,
    ).catch((e: unknown) => e);
    expect((erro as Error).message).toBe(
      "Este contacto tiene conversaciones o citas vinculadas y no se puede eliminar, para preservar el historial. Pida a un administrador que lo anonimice.",
    );
  });

  it("404 se o contato não existe na org", async () => {
    const { deleteContactHandler } = await import("@/app/api/v1/contacts/_handler");
    await expect(
      deleteContactHandler(clienteFalso({ missing: true }) as never, CTX, CONTATO),
    ).rejects.toMatchObject({ status: 404, code: "not_found" });
    expect(auditSpy).not.toHaveBeenCalled();
  });
});
