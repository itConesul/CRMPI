/**
 * #99, T4 (CA-5, RF-5) — só `manager` ou `admin` apagam contato.
 *
 * `DELETE /api/v1/contacts/[id]` exige `manager`: `agent` e `viewer` recebem 403 `forbidden_role`
 * SEM chegar ao handler; `manager` e `admin` recebem 204. A regra mora na rota (o servidor), e o botão
 * da tela só espelha esse predicado (T5): esconder o botão sem endurecer a rota deixaria a porta aberta.
 *
 * O `requireRole` é substituído por uma versão que aplica o `ROLE_RANK` de verdade (o mesmo padrão de
 * `ai-cases-routes.test.ts`), então o teste reprova se a rota pedir um papel MENOR que `manager`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/auth/server", () => ({ loadAuthUser: vi.fn(), resolveActiveOrg: vi.fn() }));

const deleteSpy = vi.fn(async (_sb: unknown, _ctx: unknown, id: string) => ({ id }));
vi.mock("@/app/api/v1/contacts/_handler", () => ({
  deleteContactHandler: (sb: unknown, ctx: unknown, id: string) => deleteSpy(sb, ctx, id),
  getContactHandler: vi.fn(),
  patchContactHandler: vi.fn(),
}));

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONTATO = "99999999-9999-4999-8999-999999999999";

/** Sessão com o papel efetivo `role`; o `requireRole` falso aplica o ROLE_RANK de verdade. */
function sessao(role: Role) {
  const user: AuthUser = {
    id: USER_ID,
    email: "u@example.com",
    full_name: null,
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR" as const,
    organizations: [{ organization_id: ORG_ID, organization_name: "Org", role }],
  };
  vi.mocked(requireRole).mockImplementation(async (min: Role) => {
    if (ROLE_RANK[role] >= ROLE_RANK[min]) {
      return { ok: true, user, org: { orgId: ORG_ID, name: "Org", role } };
    }
    return { ok: false, response: fail("forbidden_role", `Requer role >= ${min}.`, 403, {}) };
  });
}

async function apagar(): Promise<Response> {
  const { DELETE } = await import("@/app/api/v1/contacts/[id]/route");
  return DELETE(new NextRequest(`http://localhost/api/v1/contacts/${CONTATO}`, { method: "DELETE" }), {
    params: Promise.resolve({ id: CONTATO }),
  });
}

describe("DELETE /api/v1/contacts/[id] — só manager ou acima", () => {
  beforeEach(() => {
    deleteSpy.mockClear();
    vi.mocked(requireRole).mockReset();
  });

  it.each<[Role]>([["viewer"], ["agent"]])("%s recebe 403 forbidden_role e o handler NÃO é chamado", async (papel) => {
    sessao(papel);
    const res = await apagar();
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("forbidden_role");
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it.each<[Role]>([["manager"], ["admin"]])("%s recebe 204 e o handler roda com a org da sessão", async (papel) => {
    sessao(papel);
    const res = await apagar();
    expect(res.status).toBe(204);
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy.mock.calls[0]?.[1]).toMatchObject({ organization_id: ORG_ID, actor: { type: "user", id: USER_ID } });
    expect(deleteSpy.mock.calls[0]?.[2]).toBe(CONTATO);
  });

  it("a rota pede exatamente o papel manager (e o recurso contacts) ao requireRole", async () => {
    sessao("admin");
    await apagar();
    expect(vi.mocked(requireRole).mock.calls[0]?.[0]).toBe("manager");
    expect(vi.mocked(requireRole).mock.calls[0]?.[1]).toMatchObject({ resource: "contacts" });
  });
});
