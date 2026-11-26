import { describe, expect, it } from "vitest";

import {
  comoUsuario,
  mencaoAtingeUsuario,
  rotuloDoMembro,
  tokenDeMencao,
  tokensDeMencao,
  type MembroMencionavel,
} from "./mentions";

describe("menções em nota", () => {
  const user = { id: "u-1", email: "ana.silva@clinica.com", full_name: "Ana Silva" };

  it("extrai tokens", () => {
    expect(tokensDeMencao("oi @Ana e @ana.silva")).toEqual(["ana", "ana.silva"]);
  });

  it("casa e-mail, local-part e primeiro nome", () => {
    expect(mencaoAtingeUsuario("fala @ana.silva@clinica.com", user)).toBe(true);
    expect(mencaoAtingeUsuario("fala @ana.silva", user)).toBe(true);
    expect(mencaoAtingeUsuario("fala @Ana", user)).toBe(true);
    expect(mencaoAtingeUsuario("sem menção", user)).toBe(false);
  });
});

// Conjunto do CA-6 (spec #69, `03-testes.md`). Os ids diferem já nos 8 primeiros
// caracteres, porque o rótulo do membro sem nome usa esse prefixo (CA-12).
const ANA_SILVA: MembroMencionavel = { user_id: "a1000000-0000-4000-8000-000000000001", full_name: "Ana Silva" };
const ANA_SOUZA: MembroMencionavel = { user_id: "a2000000-0000-4000-8000-000000000002", full_name: "Ana Souza" };
const ANA_SILVANA: MembroMencionavel = { user_id: "a3000000-0000-4000-8000-000000000003", full_name: "Ana Silvana" };
const MARIA: MembroMencionavel = { user_id: "b1000000-0000-4000-8000-000000000004", full_name: "Maria da Silva" };
const JOAO: MembroMencionavel = { user_id: "c1000000-0000-4000-8000-000000000005", full_name: "João D'Ávila" };
const JOSE: MembroMencionavel = { user_id: "d1000000-0000-4000-8000-000000000006", full_name: "José (Zé) Lima" };
const SEM_NOME: MembroMencionavel = { user_id: "e1000000-0000-4000-8000-000000000007", full_name: null };
const ANA: MembroMencionavel = { user_id: "f1000000-0000-4000-8000-000000000008", full_name: "Ana" };
const CARLA: MembroMencionavel = { user_id: "91000000-0000-4000-8000-000000000009", full_name: "Carla" };

const CONJUNTO: MembroMencionavel[] = [
  ANA_SILVA,
  ANA_SOUZA,
  ANA_SILVANA,
  MARIA,
  JOAO,
  JOSE,
  SEM_NOME,
  ANA,
  CARLA,
];

// O cliente não tem e-mail (`team/assignable` não o devolve, por PII). O helper de produção
// avalia com um e-mail marcador derivado do id, que não casa com token por nome. Os testes usam
// ESSA função: uma cópia do marcador aqui seguiria verde mesmo se a de produção deixasse de servir.
const comMarcador = comoUsuario;

// Contrato entre `comoUsuario` e `mencaoAtingeUsuario` (ressalva da revisão do #138): o
// autocomplete só funciona porque o parser, recebendo o usuário-marcador, aplica as regras de
// NOME. Se o parser mudar (ex.: validar o e-mail, ou olhar o nome antes dele), o `tokenDeMencao`
// cairia para `@<user_id>` em silêncio. Estes casos falham no ponto do contrato, com mensagem clara.
describe("contrato: comoUsuario x mencaoAtingeUsuario", () => {
  const m: MembroMencionavel = { user_id: "a1000000-0000-4000-8000-000000000001", full_name: "Ana Silva" };
  const u = comoUsuario(m);

  it("o marcador é não vazio e não roteável (e-mail real nunca é inventado)", () => {
    expect(u.email).not.toBe("");
    expect(u.email.endsWith("@marcador.invalid")).toBe(true);
    expect(u.id).toBe(m.user_id);
    expect(u.full_name).toBe("Ana Silva");
  });

  it("o parser aplica as regras de NOME ao usuário-marcador: primeiro nome e nome sem espaços", () => {
    expect(mencaoAtingeUsuario("@Ana", u), "primeiro nome").toBe(true);
    expect(mencaoAtingeUsuario("@AnaSilva", u), "nome sem espaços").toBe(true);
  });

  it("o parser casa o user_id, o token de queda", () => {
    expect(mencaoAtingeUsuario(`@${m.user_id}`, u)).toBe(true);
  });

  it("o marcador não casa por e-mail com token nenhum que alguém digitaria", () => {
    expect(mencaoAtingeUsuario("@marcador.invalid", u)).toBe(false);
    expect(mencaoAtingeUsuario("@marcador", u)).toBe(false);
    expect(mencaoAtingeUsuario("@Maria", u)).toBe(false);
  });

  it("sem o marcador (e-mail vazio) as regras de nome NÃO rodam: é por isso que ele existe", () => {
    expect(mencaoAtingeUsuario("@AnaSilva", { ...u, email: "" })).toBe(false);
  });

  it("membro sem nome só é atingido pelo user_id", () => {
    const sem = comoUsuario({ user_id: "e1000000-0000-4000-8000-000000000007", full_name: null });
    expect(mencaoAtingeUsuario("@Ana", sem)).toBe(false);
    expect(mencaoAtingeUsuario("@e1000000-0000-4000-8000-000000000007", sem)).toBe(true);
  });
});

describe("tokenDeMencao (CA-6)", () => {
  it.each(CONJUNTO.map((m) => [m.full_name ?? "(sem nome)", m] as const))(
    "o token de %s atinge esse membro e nenhum outro do conjunto",
    (_nome, m) => {
      const token = tokenDeMencao(m, CONJUNTO);
      const texto = `oi @${token}`;

      expect(mencaoAtingeUsuario(texto, comMarcador(m))).toBe(true);
      for (const outro of CONJUNTO.filter((o) => o.user_id !== m.user_id)) {
        expect(mencaoAtingeUsuario(texto, comMarcador(outro))).toBe(false);
      }
    },
  );

  it("usa o nome sem espaços quando ele é inequívoco", () => {
    expect(tokenDeMencao(ANA_SILVA, CONJUNTO)).toBe("AnaSilva");
    expect(tokenDeMencao(ANA_SOUZA, CONJUNTO)).toBe("AnaSouza");
    expect(tokenDeMencao(ANA_SILVANA, CONJUNTO)).toBe("AnaSilvana");
    expect(tokenDeMencao(MARIA, CONJUNTO)).toBe("MariadaSilva");
    expect(tokenDeMencao(CARLA, CONJUNTO)).toBe("Carla");
  });

  it("cai para o user_id quando o nome não cabe no token ou não existe", () => {
    expect(tokenDeMencao(JOAO, CONJUNTO)).toBe(JOAO.user_id); // apóstrofo corta o token
    expect(tokenDeMencao(JOSE, CONJUNTO)).toBe(JOSE.user_id); // parênteses
    expect(tokenDeMencao(SEM_NOME, CONJUNTO)).toBe(SEM_NOME.user_id);
  });

  it('"Ana" de uma palavra cai para o user_id: "@Ana" atingiria as três Anas', () => {
    expect(tokenDeMencao(ANA, CONJUNTO)).toBe(ANA.user_id);
  });

  // Controle: sem verificar os outros membros, o membro "Ana" inseriria "@Ana"
  // e avisaria três pessoas. É a falha que o `tokenDeMencao(m, todos)` impede.
  it("controle: a versão ingênua (só o nome sem espaços) falha em 'Ana'", () => {
    const ingenuo = (m: MembroMencionavel) => (m.full_name ?? "").replace(/\s+/g, "");
    const atingidos = CONJUNTO.filter((o) => mencaoAtingeUsuario(`@${ingenuo(ANA)}`, comMarcador(o)));
    expect(atingidos.map((o) => o.full_name)).toEqual(["Ana Silva", "Ana Souza", "Ana Silvana", "Ana"]);
  });

  // A armadilha (R7): com e-mail vazio o parser devolve false ANTES de olhar o
  // nome. Se alguém "simplificar" tirando o e-mail marcador, todo token por nome
  // falha em silêncio e tudo cai para `@<user_id>`. Este teste trava o comportamento.
  it("armadilha: o parser devolve false com e-mail vazio, antes das regras de nome", () => {
    expect(
      mencaoAtingeUsuario("@AnaSilva", { id: ANA_SILVA.user_id, email: "", full_name: "Ana Silva" }),
    ).toBe(false);
    expect(mencaoAtingeUsuario("@AnaSilva", comMarcador(ANA_SILVA))).toBe(true);
  });

  it("sozinho na lista, o nome sem espaços vale", () => {
    expect(tokenDeMencao(ANA, [ANA])).toBe("Ana");
  });
});

describe("rotuloDoMembro (CA-12)", () => {
  it("devolve o full_name quando existe", () => {
    expect(rotuloDoMembro(ANA_SILVA)).toBe("Ana Silva");
  });

  it("sem nome: 'Membro sem nome · ' + 8 primeiros caracteres do user_id", () => {
    expect(rotuloDoMembro(SEM_NOME)).toBe("Membro sem nome · e1000000");
  });

  it("nome em branco conta como sem nome", () => {
    expect(rotuloDoMembro({ user_id: SEM_NOME.user_id, full_name: "   " })).toBe(
      "Membro sem nome · e1000000",
    );
  });

  it("aceita o texto 'Membro sem nome' já traduzido (o componente passa via useT)", () => {
    expect(rotuloDoMembro(SEM_NOME, "Miembro sin nombre")).toBe("Miembro sin nombre · e1000000");
  });
});

describe("caminho degradado de team/assignable (CA-12): todos com full_name null", () => {
  const TODOS_NULOS: MembroMencionavel[] = CONJUNTO.map((m) => ({ ...m, full_name: null }));

  it("cada membro vira @<user_id> e o parser atinge esse e nenhum outro", () => {
    for (const m of TODOS_NULOS) {
      const token = tokenDeMencao(m, TODOS_NULOS);
      expect(token).toBe(m.user_id);
      expect(mencaoAtingeUsuario(`@${token}`, comMarcador(m))).toBe(true);
      for (const outro of TODOS_NULOS.filter((o) => o.user_id !== m.user_id)) {
        expect(mencaoAtingeUsuario(`@${token}`, comMarcador(outro))).toBe(false);
      }
    }
  });

  it("os rótulos são distintos (os ids diferem nos 8 primeiros caracteres)", () => {
    const rotulos = TODOS_NULOS.map((m) => rotuloDoMembro(m));
    expect(new Set(rotulos).size).toBe(TODOS_NULOS.length);
  });
});
