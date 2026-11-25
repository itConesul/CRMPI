import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * O GATE DE EXPEDIENTE LÊ `organizations.settings` SOB RLS — E A LEITURA NUNCA É ESCONDIDA DE QUEM
 * ELE ALCANÇA (PRD-01 / #67, review do PR #88, item 2).
 *
 * ═══ O risco que este arquivo vigia ═══
 *
 * `carregarExpediente` roda com o client do USUÁRIO (spec `02-design.md`, T0(a): "service role não
 * usado: é o client do usuário, sob RLS"). Se a policy `orgs_select` esconder a linha, o
 * `maybeSingle` devolve `null` SEM erro e o gate falha ABERTO para todos, em silêncio.
 *
 * O que sustenta que isso não acontece hoje é uma coincidência entre DUAS funções separadas: o gate
 * só roda para quem `fn_user_role_in_org` devolveu um papel, e a policy deixa ler a linha a quem
 * `fn_user_org_ids` devolve. As duas filtram `revoked_at is null`. Se uma ganhar uma condição que a
 * outra não tem (vínculo suspenso, expirado…), o usuário continua `agent` para o gate e a RLS
 * esconde a linha. Este arquivo amarra as duas.
 *
 * ═══ O que prova ═══
 *
 * 1. Controle positivo, por papel: quem `fn_user_role_in_org` reconhece lê `organizations.settings`
 *    da PRÓPRIA organização (viewer, agent, manager, admin).
 * 2. Isolamento (RNF-2): o mesmo usuário lê ZERO linhas da organização vizinha.
 * 3. Membro revogado: `fn_user_role_in_org` devolve NULL **e** a leitura devolve zero — as duas
 *    concordam, então o `requireRole` o barra por papel antes de o gate existir para ele.
 *
 * Conectar como `postgres` mediria NADA (`rolbypassrls = t`): aqui é `set role authenticated` +
 * `request.jwt.claims`, o caminho da produção. Arquivo NOVO de propósito: `tests/invariants/**` é
 * congelado pelo `loop/hooks/freeze-invariants.sh` contra modificação.
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error(
    "TEST_DB_CONTAINER not set — rode esta suíte via `pnpm test:db` (scripts/test-db.sh)",
  );
}
const containerName: string = container;

function sql(script: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-f", "-"],
    { input: script, encoding: "utf8" },
  ).trim();
}

/** Roda `consulta` como o usuário (JWT simulado) e devolve a ÚLTIMA linha da saída. */
function como(userId: string, consulta: string): string {
  const out = sql(`
    set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
    ${consulta}
  `);
  const linhas = out.split("\n");
  return linhas[linhas.length - 1] ?? "";
}

// UUIDs próprios, para este arquivo não disputar linhas com os outros na mesma base.
const ORG_A = "e0ed1e07-0000-4000-8000-00000000000a";
const ORG_B = "e0ed1e07-0000-4000-8000-00000000000b";
const USUARIOS = {
  viewer: "e0ed1e07-1111-4000-8000-000000000001",
  agent: "e0ed1e07-1111-4000-8000-000000000002",
  manager: "e0ed1e07-1111-4000-8000-000000000003",
  admin: "e0ed1e07-1111-4000-8000-000000000004",
  revogado: "e0ed1e07-1111-4000-8000-000000000005",
} as const;
const AGENT_B = "e0ed1e07-1111-4000-8000-0000000000bb";

const PAPEIS = ["viewer", "agent", "manager", "admin"] as const;

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${USUARIOS.viewer}',   'exp-viewer@invariant.test'),
      ('${USUARIOS.agent}',    'exp-agent@invariant.test'),
      ('${USUARIOS.manager}',  'exp-manager@invariant.test'),
      ('${USUARIOS.admin}',    'exp-admin@invariant.test'),
      ('${USUARIOS.revogado}', 'exp-revogado@invariant.test'),
      ('${AGENT_B}',           'exp-agent-b@invariant.test')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name, settings) values
      ('${ORG_A}', 'exp-inv-a', 'Expediente Invariant A', 'Exp A',
        '{"business_hours":{"timezone":"America/Sao_Paulo","windows":[]},"marca":"A"}'::jsonb),
      ('${ORG_B}', 'exp-inv-b', 'Expediente Invariant B', 'Exp B',
        '{"business_hours":{"timezone":"America/Sao_Paulo","windows":[]},"marca":"B"}'::jsonb)
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at, revoked_at) values
      ('${USUARIOS.viewer}',   '${ORG_A}', 'viewer',  now(), null),
      ('${USUARIOS.agent}',    '${ORG_A}', 'agent',   now(), null),
      ('${USUARIOS.manager}',  '${ORG_A}', 'manager', now(), null),
      ('${USUARIOS.admin}',    '${ORG_A}', 'admin',   now(), null),
      ('${USUARIOS.revogado}', '${ORG_A}', 'agent',   now(), now()),
      ('${AGENT_B}',           '${ORG_B}', 'agent',   now(), null)
      on conflict do nothing;
  `);
});

describe("expediente — a leitura sob RLS acompanha o papel que o gate usa", () => {
  it.each(PAPEIS)(
    "%s ativo: fn_user_role_in_org reconhece o papel E a leitura da própria org devolve a linha (controle positivo)",
    (papel) => {
      const id = USUARIOS[papel];
      expect(como(id, `select public.fn_user_role_in_org('${ORG_A}');`)).toBe(papel);
      expect(
        como(id, `select count(*) from public.organizations where id = '${ORG_A}' and settings ? 'business_hours';`),
      ).toBe("1");
    },
  );

  it.each(PAPEIS)("%s da org A lê ZERO linhas da org B (isolamento, RNF-2)", (papel) => {
    expect(como(USUARIOS[papel], `select count(*) from public.organizations where id = '${ORG_B}';`)).toBe("0");
  });

  it("o agent da org B não lê a org A (o inverso)", () => {
    expect(como(AGENT_B, `select count(*) from public.organizations where id = '${ORG_A}';`)).toBe("0");
  });

  it("membro REVOGADO: fn_user_role_in_org devolve vazio E a leitura devolve zero — as duas funções concordam", () => {
    expect(como(USUARIOS.revogado, `select coalesce(public.fn_user_role_in_org('${ORG_A}'), 'NULO');`)).toBe("NULO");
    expect(
      como(USUARIOS.revogado, `select count(*) from public.organizations where id = '${ORG_A}';`),
    ).toBe("0");
  });
});
