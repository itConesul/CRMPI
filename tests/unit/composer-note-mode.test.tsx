import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
const createNoteMock = vi.fn();

vi.mock("@/hooks/inbox/useSendMessage", () => ({
  useSendMessage: () => ({ mutate: sendMock, isPending: false }),
}));
vi.mock("@/hooks/inbox/useCreateNote", () => ({
  useCreateNote: () => ({ mutate: createNoteMock, isPending: false }),
}));
vi.mock("@/hooks/inbox/useUploadMedia", () => ({
  useUploadMedia: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useMessageTemplates", () => ({
  useMessageTemplates: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/inbox/useDraftReply", () => ({
  useDraftReply: () => ({ mutate: vi.fn(), isPending: false }),
}));
// Autocomplete de @ (#69): a lista de membros vem de `team/assignable`; aqui ela é fixa e
// `membrosAtual` deixa cada teste simular carregando/erro. `membrosEnabled` registra o que o
// Composer pediu: a busca só pode ligar em modo nota (RF-1).
const membrosEnabled = vi.fn();
let membrosAtual: { data: unknown; isLoading: boolean; isError: boolean } = {
  data: [],
  isLoading: false,
  isError: false,
};
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({
  useAssignableMembers: (enabled: boolean) => {
    membrosEnabled(enabled);
    return membrosAtual;
  },
}));

import { Composer } from "@/components/inbox/Composer";

function renderComposer(props: Partial<ComponentProps<typeof Composer>> = {}) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <Composer conversationId="conv-1" {...props} />
    </QueryClientProvider>,
  );
}

describe("Composer + modo nota interna", () => {
  beforeEach(() => {
    sendMock.mockClear();
    createNoteMock.mockClear();
  });

  it("modo reply (default): envia normal via useSendMessage", () => {
    renderComposer();
    fireEvent.change(screen.getByLabelText(/mensagem/i), { target: { value: "oi cliente" } });
    fireEvent.click(screen.getByRole("button", { name: /^enviar$/i }));

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ conversation_id: "conv-1", body: "oi cliente", type: "text" }),
      expect.anything(),
    );
    expect(createNoteMock).not.toHaveBeenCalled();
  });

  it("limpa o input na hora do envio, sem esperar onSuccess da API", () => {
    sendMock.mockImplementation(() => {
      /* simula request lento — onSuccess não é chamado */
    });
    renderComposer();
    const input = screen.getByLabelText(/mensagem/i);
    fireEvent.change(input, { target: { value: "oi cliente" } });
    fireEvent.click(screen.getByRole("button", { name: /^enviar$/i }));

    expect(input).toHaveValue("");
  });

  it("alterna pra modo nota interna: some anexo/rascunho/áudio, muda placeholder", () => {
    renderComposer();
    expect(screen.getByRole("button", { name: /anexar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sugerir resposta/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /nota interna/i }));

    expect(screen.queryByRole("button", { name: /anexar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sugerir resposta/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /gravar áudio/i })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/nota interna/i)).toBeInTheDocument();
  });

  it("modo nota interna: enviar chama useCreateNote e NÃO useSendMessage", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: /nota interna/i }));

    fireEvent.change(screen.getByPlaceholderText(/nota interna/i), { target: { value: "cliente ligou reclamando" } });
    fireEvent.click(screen.getByRole("button", { name: /^enviar$/i }));

    expect(createNoteMock).toHaveBeenCalledWith(
      expect.objectContaining({ conversation_id: "conv-1", body: "cliente ligou reclamando" }),
      expect.anything(),
    );
    expect(sendMock).not.toHaveBeenCalled();
  });
});

// ─── Autocomplete de @ nas notas internas (spec #69, T4) ────────────────────────────────────────
const MEMBROS = [
  { user_id: "a1000000-0000-4000-8000-000000000001", role: "agent", full_name: "Ana Silva" },
  { user_id: "b1000000-0000-4000-8000-000000000002", role: "agent", full_name: "Beto Souza" },
  { user_id: "c1000000-0000-4000-8000-000000000003", role: "manager", full_name: "Mariana Lima" },
];

function abrirNota(valor: string, props: Partial<ComponentProps<typeof Composer>> = {}) {
  renderComposer(props);
  fireEvent.click(screen.getByRole("button", { name: /nota interna/i }));
  const campo = screen.getByPlaceholderText(/nota interna/i) as HTMLTextAreaElement;
  fireEvent.change(campo, { target: { value: valor } });
  return campo;
}

describe("Composer + autocomplete de @ (#69, T4)", () => {
  beforeEach(() => {
    sendMock.mockClear();
    createNoteMock.mockClear();
    membrosEnabled.mockClear();
    membrosAtual = { data: MEMBROS, isLoading: false, isError: false };
  });

  describe("quando abre (RF-1, CA-3)", () => {
    it("em modo nota, digitar @ abre a lista com os membros", () => {
      abrirNota("@");
      expect(screen.getByRole("listbox", { name: "Mencionar membro" })).toBeInTheDocument();
      expect(screen.getAllByRole("option")).toHaveLength(3);
    });

    it("em modo mensagem a lista NUNCA abre, mesmo com @", () => {
      renderComposer();
      fireEvent.change(screen.getByLabelText(/mensagem/i), { target: { value: "oi @" } });
      expect(screen.queryByRole("listbox", { name: "Mencionar membro" })).not.toBeInTheDocument();
    });

    it("em modo mensagem o teclado também não é tocado: Enter com @ no texto ENVIA", () => {
      renderComposer();
      const campo = screen.getByLabelText(/mensagem/i);
      fireEvent.change(campo, { target: { value: "oi @ana" } });

      const naoCancelado = fireEvent.keyDown(campo, { key: "Enter" });

      expect(naoCancelado).toBe(false); // o Enter é do envio, que o consome como sempre
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({ body: "oi @ana", type: "text" }),
        expect.anything(),
      );
      expect(createNoteMock).not.toHaveBeenCalled();
    });

    // Q2 (decidida em 2026-11-19): a lista não oferece o próprio autor. O servidor e o aviso in-app
    // já ignoram auto-menção, então oferecê-lo seria oferecer uma menção que nunca avisa ninguém.
    it("não oferece o próprio autor da nota (Q2)", () => {
      abrirNota("@", { autorId: MEMBROS[0]!.user_id });
      expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Beto Souza", "Mariana Lima"]);
    });

    it("digitar o nome do autor não o traz de volta (Q2)", () => {
      // "silva" só casa o autor (Mariana Lima também contém "ana", então "ana" não serviria).
      abrirNota("@silva", { autorId: MEMBROS[0]!.user_id });
      expect(screen.queryByRole("option", { name: "Ana Silva" })).not.toBeInTheDocument();
      expect(screen.getByText("Nenhum membro encontrado")).toBeInTheDocument();
    });

    it("sem autorId a lista é inteira (nenhuma exclusão silenciosa)", () => {
      abrirNota("@");
      expect(screen.getAllByRole("option")).toHaveLength(3);
    });

    it("o token continua sendo calculado contra TODOS os membros, autor incluído", () => {
      // A autora ("Ana Silva") some da lista. Escolher "Ana" gera "@Ana", que por primeiro nome também
      // atingiria a autora. A spec manda conferir o token contra a lista INTEIRA de team/assignable
      // (`02-design.md` §2 item 4), então cai para o user_id: o token não depende de quem escreve.
      // É conservador (o servidor ignora auto-menção), mas é o que a spec define.
      membrosAtual = {
        ...membrosAtual,
        data: [
          { user_id: "f1000000-0000-4000-8000-000000000008", role: "agent", full_name: "Ana" },
          { user_id: "a1000000-0000-4000-8000-000000000001", role: "agent", full_name: "Ana Silva" },
        ],
      };
      const campo = abrirNota("@", { autorId: "a1000000-0000-4000-8000-000000000001" });
      expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Ana"]);
      fireEvent.click(screen.getByRole("option", { name: "Ana" }));
      expect(campo.value).toBe("@f1000000-0000-4000-8000-000000000008 ");
    });

    it("não abre dentro de um e-mail", () => {
      abrirNota("fale com ana@clinica.com");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("a busca de membros só liga em modo nota", () => {
      renderComposer();
      expect(membrosEnabled).toHaveBeenLastCalledWith(false);
      fireEvent.click(screen.getByRole("button", { name: /nota interna/i }));
      expect(membrosEnabled).toHaveBeenLastCalledWith(true);
      fireEvent.click(screen.getByRole("button", { name: /^responder$/i }));
      expect(membrosEnabled).toHaveBeenLastCalledWith(false);
    });

    it("filtra enquanto se digita, sem diferenciar maiúsculas (CA-4)", () => {
      abrirNota("oi @MAR");
      expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Mariana Lima"]);
    });

    it("um espaço depois do @ fecha a lista", () => {
      const campo = abrirNota("oi @an");
      expect(screen.getByRole("listbox")).toBeInTheDocument();
      fireEvent.change(campo, { target: { value: "oi @an " } });
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  describe("selecionar (RF-3, CA-5)", () => {
    it("clicar troca só o trecho @consulta pelo token + um espaço e NÃO salva a nota (CA-1)", () => {
      const campo = abrirNota("oi @an");
      fireEvent.click(screen.getByRole("option", { name: "Ana Silva" }));

      expect(campo.value).toBe("oi @AnaSilva ");
      expect(campo.selectionStart).toBe("oi @AnaSilva ".length);
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(createNoteMock).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
    });

    it("Enter seleciona o item ativo, mantém o resto do texto e não salva a nota", () => {
      const campo = abrirNota("@ma");
      fireEvent.keyDown(campo, { key: "Enter" });

      expect(campo.value).toBe("@MarianaLima ");
      expect(createNoteMock).not.toHaveBeenCalled();
    });

    it("o token inserido é o user_id quando o nome sozinho atingiria outro membro", () => {
      membrosAtual = {
        ...membrosAtual,
        data: [
          { user_id: "f1000000-0000-4000-8000-000000000008", role: "agent", full_name: "Ana" },
          { user_id: "a1000000-0000-4000-8000-000000000001", role: "agent", full_name: "Ana Silva" },
        ],
      };
      const campo = abrirNota("@");
      fireEvent.click(screen.getByRole("option", { name: "Ana" }));
      expect(campo.value).toBe("@f1000000-0000-4000-8000-000000000008 ");
    });

    it("salvar a nota depois de selecionar manda o texto com o token (CA-1)", () => {
      const campo = abrirNota("@be");
      fireEvent.keyDown(campo, { key: "Enter" }); // seleciona
      fireEvent.keyDown(campo, { key: "Enter" }); // lista fechada: agora salva
      expect(createNoteMock).toHaveBeenCalledTimes(1);
      expect(createNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({ conversation_id: "conv-1", body: "@BetoSouza" }),
        expect.anything(),
      );
      expect(sendMock).not.toHaveBeenCalled();
    });
  });

  describe("teclado (RNF-1, CA-7)", () => {
    it("↓ e ↑ movem o item ativo (aria-selected)", () => {
      const campo = abrirNota("@");
      const ativo = () =>
        screen.getAllByRole("option").findIndex((o) => o.getAttribute("aria-selected") === "true");
      expect(ativo()).toBe(0);
      fireEvent.keyDown(campo, { key: "ArrowDown" });
      expect(ativo()).toBe(1);
      fireEvent.keyDown(campo, { key: "ArrowDown" });
      expect(ativo()).toBe(2);
      fireEvent.keyDown(campo, { key: "ArrowUp" });
      expect(ativo()).toBe(1);
    });

    it("Enter depois de ↓ seleciona o segundo membro", () => {
      const campo = abrirNota("@");
      fireEvent.keyDown(campo, { key: "ArrowDown" });
      fireEvent.keyDown(campo, { key: "Enter" });
      expect(campo.value).toBe("@BetoSouza ");
      expect(createNoteMock).not.toHaveBeenCalled();
    });

    it("Esc fecha a lista e o texto fica intacto", () => {
      const campo = abrirNota("oi @an");
      fireEvent.keyDown(campo, { key: "Escape" });
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(campo.value).toBe("oi @an");
      expect(createNoteMock).not.toHaveBeenCalled();
    });

    it("depois do Esc, continuar digitando a mesma menção não reabre a lista", () => {
      const campo = abrirNota("oi @an");
      fireEvent.keyDown(campo, { key: "Escape" });
      fireEvent.change(campo, { target: { value: "oi @ana" } });
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("um @ novo, depois de a menção anterior fechar, abre a lista de novo", () => {
      const campo = abrirNota("oi @an");
      fireEvent.keyDown(campo, { key: "Escape" });
      fireEvent.change(campo, { target: { value: "oi @an e " } });
      fireEvent.change(campo, { target: { value: "oi @an e @" } });
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("Shift+Enter com a lista aberta não seleciona nem salva", () => {
      const campo = abrirNota("@an");
      fireEvent.keyDown(campo, { key: "Enter", shiftKey: true });
      expect(campo.value).toBe("@an");
      expect(createNoteMock).not.toHaveBeenCalled();
    });
  });

  describe("sem resultado (CA-13)", () => {
    it("mostra 'Nenhum membro encontrado' e o Enter não salva nem insere", () => {
      const campo = abrirNota("@zzz");
      expect(screen.getByText("Nenhum membro encontrado")).toBeInTheDocument();

      // `false` = o preventDefault rodou. Sem ele o navegador insere uma quebra de linha no texto.
      const naoCancelado = fireEvent.keyDown(campo, { key: "Enter" });

      expect(naoCancelado).toBe(false);
      expect(createNoteMock).not.toHaveBeenCalled();
      expect(campo.value).toBe("@zzz");
    });

    it("depois do Esc, o Enter salva a nota com o texto como está", () => {
      const campo = abrirNota("@zzz");
      fireEvent.keyDown(campo, { key: "Escape" });
      fireEvent.keyDown(campo, { key: "Enter" });

      expect(createNoteMock).toHaveBeenCalledTimes(1);
      expect(createNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({ body: "@zzz" }),
        expect.anything(),
      );
    });

    it("depois de um espaço, o Enter salva a nota", () => {
      const campo = abrirNota("@zzz");
      fireEvent.change(campo, { target: { value: "@zzz " } });
      fireEvent.keyDown(campo, { key: "Enter" });

      expect(createNoteMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("falha ou demora da lista nunca prende a nota (anti-morte)", () => {
    it("erro ao carregar os membros: mostra o aviso e o Enter SALVA a nota", () => {
      membrosAtual = { data: undefined, isLoading: false, isError: true };
      const campo = abrirNota("@ana");
      expect(screen.getByText("Não foi possível carregar os membros.")).toBeInTheDocument();

      fireEvent.keyDown(campo, { key: "Enter" });

      expect(createNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({ body: "@ana" }),
        expect.anything(),
      );
    });

    it("carregando os membros: mostra 'Carregando…' e o Enter SALVA a nota", () => {
      membrosAtual = { data: undefined, isLoading: true, isError: false };
      const campo = abrirNota("@ana");
      expect(screen.getByText("Carregando…")).toBeInTheDocument();
      expect(screen.queryByText("Nenhum membro encontrado")).not.toBeInTheDocument();

      fireEvent.keyDown(campo, { key: "Enter" });

      expect(createNoteMock).toHaveBeenCalledTimes(1);
    });

    it("membros vazios (organização sem ninguém mencionável): estado vazio e Esc devolve o Enter", () => {
      membrosAtual = { data: [], isLoading: false, isError: false };
      const campo = abrirNota("@");
      expect(screen.getByText("Nenhum membro encontrado")).toBeInTheDocument();
      fireEvent.keyDown(campo, { key: "Escape" });
      fireEvent.keyDown(campo, { key: "Enter" });
      expect(createNoteMock).toHaveBeenCalledTimes(1);
    });
  });

  it("não muda o fluxo sem menção: Enter comum em modo nota continua salvando", () => {
    const campo = abrirNota("cliente ligou");
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(createNoteMock).toHaveBeenCalledWith(
      expect.objectContaining({ body: "cliente ligou" }),
      expect.anything(),
    );
  });
});

/**
 * O Composer e o cabeçalho leem o expediente (PRD-01 / #67) por `useExpedienteBarra`. Esta suíte mede outra
 * coisa, então fixa o estado de quase toda instalação: sem expediente, nada barrado. O comportamento
 * fora do expediente tem suíte própria em `expediente-ui-trava-as-acoes.test.tsx`.
 */
vi.mock("@/hooks/expediente/useExpediente", () => ({
  useExpedienteBarra: () => ({ barrado: false, data: undefined, isLoading: false }),
}));
