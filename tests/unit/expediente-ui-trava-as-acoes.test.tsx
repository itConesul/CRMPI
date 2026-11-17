/**
 * FORA DO EXPEDIENTE A TELA TRAVA AS AÇÕES E DIZ POR QUÊ (PRD-01 / #67, T7).
 *
 * O servidor é quem recusa (`403 OUT_OF_WORK_HOURS`); a tela só pode evitar que o atendente digite uma
 * mensagem que será recusada e dizer o motivo. Este arquivo mede o lado da TELA, com o estado do
 * expediente simulado. A prova contra o servidor real é `tests/e2e/expediente-barra-a-acao.spec.ts`.
 *
 * A leitura NÃO trava: o cabeçalho e o campo de resposta são os únicos que mudam, e os links
 * (`Ver contato`) continuam clicáveis.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FaixaDeExpediente } from "@/components/app/FaixaDeExpediente";
import { Composer } from "@/components/inbox/Composer";
import { ConversationHeader } from "@/components/inbox/ConversationHeader";

// O estado do expediente que cada teste quer ver. `barrado` é o que `useExpedienteBarra` decide
// (papel `agent` ∧ restringe ∧ fora); a regra em si tem teste próprio em `lib/expediente`.
const estado = { barrado: false, data: undefined as unknown };
vi.mock("@/hooks/expediente/useExpediente", () => ({
  useExpedienteBarra: () => ({ barrado: estado.barrado, data: estado.data, isLoading: false }),
}));

vi.mock("@/hooks/inbox/useSendMessage", () => ({ useSendMessage: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/inbox/useCreateNote", () => ({ useCreateNote: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/inbox/useUploadMedia", () => ({ useUploadMedia: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/inbox/useMessageTemplates", () => ({ useMessageTemplates: () => ({ data: [], isLoading: false }) }));
vi.mock("@/hooks/inbox/useDraftReply", () => ({ useDraftReply: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/inbox/useClaimConversation", () => ({ useClaimConversation: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/inbox/useCloseConversation", () => ({
  useCloseConversation: () => ({ mutate: vi.fn(), isPending: false }),
  useReopenConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useReleaseConversation", () => ({ useReleaseConversation: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/inbox/useResumeAiAttendance", () => ({ useResumeAiAttendance: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  usePermission: () => true,
  useAuth: () => ({ user: { id: "u-1" }, activeOrg: { orgId: "org-1", role: "agent" } }),
}));

const conversation = {
  id: "cv-1",
  organization_id: "org-1",
  contact_id: "ct-1",
  status: "open",
  assigned_to_user_id: null,
  assignee_kind: "ai",
  snooze_until: null,
  tags: [],
  contacts: { id: "ct-1", display_name: "Fulana", name: null, phone_number: "5511999" },
} as unknown as React.ComponentProps<typeof ConversationHeader>["conversation"];

const comercial = {
  business_hours: {
    timezone: "America/Sao_Paulo",
    windows: [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "08:00", end: "18:00" })),
  },
  restringe: true,
  dentro: false,
  opens_at: "2026-07-14T08:00:00-03:00",
  agora: { iso: "2026-07-13T22:00:00-03:00", timezone: "America/Sao_Paulo", dow: 1, hhmm: "22:00" },
};

const comProvider = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

beforeEach(() => {
  estado.barrado = false;
  estado.data = undefined;
});

describe("FaixaDeExpediente", () => {
  it("fora do expediente, para o agent: diz a janela da empresa, quando abre, e que a leitura continua", () => {
    estado.barrado = true;
    estado.data = comercial;
    comProvider(<FaixaDeExpediente />);
    const faixa = screen.getByTestId("faixa-de-expediente");
    expect(faixa).toHaveTextContent(/fora do expediente/i);
    expect(faixa).toHaveTextContent("seg a sex, 08:00–18:00");
    expect(faixa).toHaveTextContent("amanhã às 08:00");
    expect(faixa).toHaveTextContent(/pode consultar as conversas/i);
    expect(screen.getByRole("link", { name: /saiba mais/i })).toHaveAttribute("href", "/app/fora-de-expediente");
  });

  it("janela que vira o dia aparece como o admin a escreveu (22:00–06:00), não partida em duas", () => {
    estado.barrado = true;
    estado.data = {
      ...comercial,
      business_hours: { timezone: "America/Sao_Paulo", windows: [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "22:00", end: "06:00" })) },
    };
    comProvider(<FaixaDeExpediente />);
    expect(screen.getByTestId("faixa-de-expediente")).toHaveTextContent("seg a sex, 22:00–06:00");
  });

  it("não aparece quando não está barrado (dentro do expediente, sem expediente, manager ou admin)", () => {
    estado.barrado = false;
    estado.data = { ...comercial, dentro: true };
    comProvider(<FaixaDeExpediente />);
    expect(screen.queryByTestId("faixa-de-expediente")).not.toBeInTheDocument();
  });
});

describe("Composer fora do expediente", () => {
  it("troca o campo de resposta pelo motivo — e a nota interna também, porque anotar é escrita", () => {
    estado.barrado = true;
    estado.data = comercial;
    comProvider(<Composer conversationId="conv-1" />);
    const aviso = screen.getByTestId("composer-barrado-por-expediente");
    expect(aviso).toHaveTextContent(/fora do expediente/i);
    expect(aviso).toHaveTextContent(/responder ou anotar/i);
    expect(screen.queryByLabelText(/mensagem/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^enviar$/i })).not.toBeInTheDocument();
  });

  it("dentro do expediente (ou sem expediente) o campo de resposta é o de sempre", () => {
    estado.barrado = false;
    comProvider(<Composer conversationId="conv-1" />);
    expect(screen.queryByTestId("composer-barrado-por-expediente")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/mensagem/i)).toBeInTheDocument();
  });
});

describe("ConversationHeader fora do expediente", () => {
  it("desabilita Assumir e Transferir e põe o MOTIVO no title; Ver contato segue clicável", () => {
    estado.barrado = true;
    estado.data = comercial;
    comProvider(<ConversationHeader conversation={conversation} />);
    const assumir = screen.getByRole("button", { name: /^assumir$/i });
    expect(assumir).toBeDisabled();
    expect(assumir).toHaveAttribute("title", expect.stringMatching(/fora do expediente/i));
    const transferir = screen.getByRole("button", { name: /^transferir$/i });
    expect(transferir).toBeDisabled();
    expect(transferir).toHaveAttribute("title", expect.stringMatching(/fora do expediente/i));
    expect(screen.getByRole("button", { name: /^fechar$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /lembrar/i })).toBeDisabled();
    // A leitura/navegação não é barrada.
    expect(screen.getByRole("link", { name: /ver contato/i })).toBeInTheDocument();
  });

  it("dentro do expediente as ações ficam habilitadas e o title é o de sempre", () => {
    estado.barrado = false;
    comProvider(<ConversationHeader conversation={conversation} />);
    const assumir = screen.getByRole("button", { name: /^assumir$/i });
    expect(assumir).toBeEnabled();
    expect(assumir).toHaveAttribute("title", expect.stringMatching(/você passa a responder/i));
    expect(screen.getByRole("button", { name: /^transferir$/i })).toBeEnabled();
  });
});
