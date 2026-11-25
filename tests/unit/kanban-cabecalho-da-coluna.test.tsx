import { DragDropContext } from "@hello-pangea/dnd";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StageColumn } from "@/components/kanban/StageColumn";
import { CORES_DE_ETAPA } from "@/lib/leads/cores-de-etapa";
import type { Stage } from "@/lib/kanban/types";

/**
 * O cabeçalho da coluna do funil, pintado com a cor da etapa (issue #124).
 *
 * O que se guarda: (a) com cor, o cabeçalho é pintado e o texto por cima é o que
 * CONTRASTA — nunca uma cor fixa; (b) sem cor, nada muda em relação ao que o
 * quadro sempre foi; (c) valor que não é `#rrggbb` não é pintado nem chega ao
 * cálculo de contraste. O jsdom devolve a cor de `style` em `rgb(...)`, então as
 * asserções são nesse formato.
 */

const BRANCO = "rgb(255, 255, 255)";
const PRETO = "rgb(0, 0, 0)";

function etapa(over: Partial<Stage> = {}): Stage {
  return {
    id: "e1",
    organization_id: "o1",
    pipeline_id: "p1",
    name: "Proposta enviada",
    slug: "proposta",
    position: 1,
    color: null,
    is_won: false,
    is_lost: false,
    is_archived: false,
    expected_duration_hours: null,
    ...over,
  };
}

function montar(stage: Stage) {
  render(
    <DragDropContext onDragEnd={() => undefined}>
      <StageColumn stage={stage} leads={[]} pipelineId="p1" />
    </DragDropContext>,
  );
  return screen.getByTestId(`cabecalho-${stage.id}`);
}

describe("StageColumn — cabeçalho pintado", () => {
  it("com cor da paleta: fundo é a cor e o texto do nome é branco", () => {
    const cab = montar(etapa({ color: "#1d4ed8" }));

    expect(cab.style.backgroundColor).toBe("rgb(29, 78, 216)");
    expect(cab.style.color).toBe(BRANCO);
    expect(screen.getByRole("heading", { name: "Proposta enviada" })).toBeInTheDocument();
  });

  it.each(CORES_DE_ETAPA.map((c) => [c.rotulo, c.hex]))(
    "%s: o nome da coluna fica com texto branco sobre o fundo pintado",
    (_rotulo, hex) => {
      const cab = montar(etapa({ color: hex! }));
      expect(cab.style.color).toBe(BRANCO);
    },
  );

  it("cor CLARA fora da paleta (etapa antiga) é pintada com texto PRETO — legível mesmo assim", () => {
    const cab = montar(etapa({ color: "#fde68a" }));

    expect(cab.style.backgroundColor).toBe("rgb(253, 230, 138)");
    expect(cab.style.color).toBe(PRETO);
  });

  it("o cabeçalho pintado arredonda o topo e dispensa o ponto cinza", () => {
    const cab = montar(etapa({ color: "#506d48" }));

    expect(cab.className).toMatch(/rounded-t-2xl/);
    expect(cab.querySelector(".bg-text-muted\\/40")).toBeNull();
  });
});

describe("StageColumn — sem cor, o quadro é o de sempre", () => {
  it("não pinta nada e mantém o ponto cinza e o texto padrão", () => {
    const cab = montar(etapa({ color: null }));

    expect(cab.style.backgroundColor).toBe("");
    expect(cab.style.color).toBe("");
    expect(cab.className).not.toMatch(/rounded-t-2xl/);
    expect(cab.querySelector(".bg-text-muted\\/40")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Proposta enviada" })).toHaveClass("text-text");
  });

  it.each(["red", "#12", "#gggggg", "url(javascript:alert(1))", "azul"])(
    "valor que não é #rrggbb (%s) não é pintado",
    (lixo) => {
      const cab = montar(etapa({ color: lixo }));

      expect(cab.style.backgroundColor).toBe("");
      expect(cab.querySelector(".bg-text-muted\\/40")).not.toBeNull();
    },
  );
});
