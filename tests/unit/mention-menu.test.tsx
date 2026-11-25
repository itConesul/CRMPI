import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  filtrarMembros,
  MentionMenu,
  teclaNoMenu,
} from "@/components/inbox/composer/MentionMenu";
import type { MembroMencionavel } from "@/lib/notifications/mentions";

// T3 da spec #69 — lista de menção: filtro (CA-4), rótulo do membro sem nome (CA-12),
// estado vazio (CA-13) e teclado (CA-7). O foco fica no <textarea>; quem lê as teclas é
// o Composer (T4), que chama `teclaNoMenu`. Aqui se prova a regra, sem o Composer.

const ANA: MembroMencionavel = { user_id: "a1000000-0000-4000-8000-000000000001", full_name: "Ana Silva" };
const BETO: MembroMencionavel = { user_id: "b1000000-0000-4000-8000-000000000002", full_name: "Beto Souza" };
const MARIANA: MembroMencionavel = { user_id: "c1000000-0000-4000-8000-000000000003", full_name: "Mariana Lima" };
const SEM_NOME: MembroMencionavel = { user_id: "e1000000-0000-4000-8000-000000000004", full_name: null };
const MEMBROS = [ANA, BETO, MARIANA, SEM_NOME];

function renderMenu(over: Partial<React.ComponentProps<typeof MentionMenu>> = {}) {
  const props = {
    open: true,
    consulta: "",
    membros: MEMBROS,
    ativo: 0,
    onAtivo: vi.fn(),
    onPick: vi.fn(),
    ...over,
  };
  render(<MentionMenu {...props} />);
  return props;
}

describe("filtrarMembros (CA-4, CA-12)", () => {
  it("consulta vazia devolve todos, na ordem recebida", () => {
    expect(filtrarMembros(MEMBROS, "")).toEqual(MEMBROS);
  });

  it("filtra por 'contém', sem diferenciar maiúsculas", () => {
    expect(filtrarMembros(MEMBROS, "an")).toEqual([ANA, MARIANA]);
    expect(filtrarMembros(MEMBROS, "AN")).toEqual([ANA, MARIANA]);
    expect(filtrarMembros(MEMBROS, "sou")).toEqual([BETO]);
  });

  it("não ignora acentos (Q3: igual ao TemplateMenu)", () => {
    const jose = { user_id: "d1000000-0000-4000-8000-000000000005", full_name: "José" };
    expect(filtrarMembros([jose], "jose")).toEqual([]);
    expect(filtrarMembros([jose], "josé")).toEqual([jose]);
  });

  it("filtra pelo RÓTULO: digitar um pedaço do id acha o membro sem nome", () => {
    expect(filtrarMembros(MEMBROS, "e10000")).toEqual([SEM_NOME]);
    expect(filtrarMembros(MEMBROS, "sem nome")).toEqual([SEM_NOME]);
  });

  it("usa o texto traduzido do 'sem nome' quando recebido", () => {
    expect(filtrarMembros(MEMBROS, "sin nombre", "Miembro sin nombre")).toEqual([SEM_NOME]);
    expect(filtrarMembros(MEMBROS, "sin nombre")).toEqual([]);
  });

  it("sem resultado devolve lista vazia", () => {
    expect(filtrarMembros(MEMBROS, "zzz")).toEqual([]);
  });
});

describe("MentionMenu — renderização", () => {
  it("fechado não renderiza nada", () => {
    renderMenu({ open: false });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("aberto: um listbox com um option por membro (CA-3, CA-4)", () => {
    renderMenu();
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getAllByRole("option")).toHaveLength(4);
  });

  it("digitar após o @ deixa só os que contêm o texto", () => {
    renderMenu({ consulta: "an" });
    const nomes = screen.getAllByRole("option").map((o) => o.textContent);
    expect(nomes).toEqual(["Ana Silva", "Mariana Lima"]);
  });

  it("membro sem nome aparece com o rótulo 'Membro sem nome · <8 do id>' (CA-12)", () => {
    renderMenu();
    expect(screen.getByRole("option", { name: "Membro sem nome · e1000000" })).toBeTruthy();
  });

  it("todos sem nome (caminho degradado): a lista continua utilizável (CA-12)", () => {
    const todosNulos = MEMBROS.map((m) => ({ ...m, full_name: null }));
    renderMenu({ membros: todosNulos });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Membro sem nome · a1000000",
      "Membro sem nome · b1000000",
      "Membro sem nome · c1000000",
      "Membro sem nome · e1000000",
    ]);
  });

  it("marca só o item ativo com aria-selected (CA-7)", () => {
    renderMenu({ ativo: 2 });
    const marcados = screen.getAllByRole("option").map((o) => o.getAttribute("aria-selected"));
    expect(marcados).toEqual(["false", "false", "true", "false"]);
  });

  it("sem resultado mostra 'Nenhum membro encontrado' e nenhum option (CA-13)", () => {
    renderMenu({ consulta: "zzz" });
    expect(screen.getByText("Nenhum membro encontrado")).toBeTruthy();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("lista vazia (nenhum membro) também mostra o estado vazio", () => {
    renderMenu({ membros: [] });
    expect(screen.getByText("Nenhum membro encontrado")).toBeTruthy();
  });

  it("o listbox tem nome acessível", () => {
    renderMenu();
    expect(screen.getByRole("listbox", { name: "Mencionar membro" })).toBeTruthy();
  });
});

describe("MentionMenu — mouse", () => {
  it("clicar em um item chama onPick com o membro", () => {
    const { onPick } = renderMenu();
    fireEvent.click(screen.getByRole("option", { name: "Beto Souza" }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(BETO);
  });

  it("clicar num item filtrado devolve o membro certo, não o índice da lista inteira", () => {
    const { onPick } = renderMenu({ consulta: "mari" });
    fireEvent.click(screen.getByRole("option", { name: "Mariana Lima" }));
    expect(onPick).toHaveBeenCalledWith(MARIANA);
  });

  it("passar o mouse move o item ativo (índice na lista filtrada)", () => {
    const { onAtivo } = renderMenu({ consulta: "an" });
    fireEvent.mouseEnter(screen.getByRole("option", { name: "Mariana Lima" }));
    expect(onAtivo).toHaveBeenCalledWith(1);
  });

  it("mouseDown não tira o foco do textarea (preventDefault)", () => {
    renderMenu();
    const opcao = screen.getByRole("option", { name: "Ana Silva" });
    const notCancelled = fireEvent.mouseDown(opcao);
    expect(notCancelled).toBe(false); // false = preventDefault foi chamado
  });
});

describe("teclaNoMenu — teclado novo (CA-7, CA-13)", () => {
  it("ArrowDown avança e dá a volta no fim", () => {
    expect(teclaNoMenu("ArrowDown", 0, 3)).toEqual({ tipo: "mover", ativo: 1 });
    expect(teclaNoMenu("ArrowDown", 2, 3)).toEqual({ tipo: "mover", ativo: 0 });
  });

  it("ArrowUp recua e dá a volta no começo", () => {
    expect(teclaNoMenu("ArrowUp", 2, 3)).toEqual({ tipo: "mover", ativo: 1 });
    expect(teclaNoMenu("ArrowUp", 0, 3)).toEqual({ tipo: "mover", ativo: 2 });
  });

  it("Enter com resultados seleciona o item ativo (e quem chama não envia a nota)", () => {
    expect(teclaNoMenu("Enter", 1, 3)).toEqual({ tipo: "selecionar", indice: 1 });
  });

  it("Escape fecha, com ou sem resultado", () => {
    expect(teclaNoMenu("Escape", 0, 3)).toEqual({ tipo: "fechar" });
    expect(teclaNoMenu("Escape", 0, 0)).toEqual({ tipo: "fechar" });
  });

  it("Enter SEM resultado é consumido: não envia e não insere (CA-13)", () => {
    expect(teclaNoMenu("Enter", 0, 0)).toEqual({ tipo: "consumir" });
  });

  it("setas sem resultado não fazem nada", () => {
    expect(teclaNoMenu("ArrowDown", 0, 0)).toEqual({ tipo: "ignorar" });
    expect(teclaNoMenu("ArrowUp", 0, 0)).toEqual({ tipo: "ignorar" });
  });

  it("qualquer outra tecla segue para o textarea", () => {
    expect(teclaNoMenu("a", 0, 3)).toEqual({ tipo: "ignorar" });
    expect(teclaNoMenu("Backspace", 0, 3)).toEqual({ tipo: "ignorar" });
    expect(teclaNoMenu(" ", 0, 3)).toEqual({ tipo: "ignorar" });
  });

  it("índice ativo fora da faixa (lista encolheu) é tratado como o último item", () => {
    expect(teclaNoMenu("Enter", 9, 2)).toEqual({ tipo: "selecionar", indice: 1 });
    expect(teclaNoMenu("ArrowDown", 9, 2)).toEqual({ tipo: "mover", ativo: 0 });
  });
});
