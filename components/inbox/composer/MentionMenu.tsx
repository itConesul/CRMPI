"use client";
/**
 * Autocomplete de `@usuário` nas notas internas (spec #69, `docs/specs/sdd/69-autocomplete-mencao/`).
 *
 * Gatilho puro e troca do trecho (T2); filtro, teclado e a lista `MentionMenu` (T3).
 * O foco fica no `<textarea>` do Composer, que lê as teclas e chama `teclaNoMenu`; o
 * menu em si só mostra a lista e reage ao mouse. A integração é a T4.
 */
import { useT } from "@/hooks/i18n/useT";
import { rotuloDoMembro, type MembroMencionavel } from "@/lib/notifications/mentions";

/** Onde o `@` em edição está e o que já foi digitado depois dele. */
export interface MencaoEmEdicao {
  aberto: boolean;
  /** Texto digitado depois do `@`, sem espaço. Vazio quando fechado. */
  consulta: string;
  /** Posição do `@`; o trecho a trocar é `[inicio, fim)`. */
  inicio: number;
  /** Posição do cursor. */
  fim: number;
}

/**
 * Estado do autocomplete a partir do texto e do cursor. Puro (testável).
 *
 * Abre só quando o `@` mais próximo antes do cursor está no começo do texto ou depois de
 * espaço/quebra de linha (para não abrir dentro de `ana@clinica.com`), e nada entre o `@`
 * e o cursor é espaço. A consulta vai até o cursor, não até o fim do texto.
 */
export function resolverMencao(texto: string, cursor: number): MencaoEmEdicao {
  const fim = Math.min(Math.max(cursor, 0), texto.length);
  const fechado: MencaoEmEdicao = { aberto: false, consulta: "", inicio: fim, fim };

  const inicio = texto.lastIndexOf("@", fim - 1);
  if (fim === 0 || inicio < 0) return fechado;

  const antes = texto.charAt(inicio - 1); // "" quando o `@` abre o texto
  if (antes !== "" && !/\s/.test(antes)) return fechado;

  const consulta = texto.slice(inicio + 1, fim);
  if (/\s/.test(consulta)) return fechado;

  return { aberto: true, consulta, inicio, fim };
}

/**
 * Troca o trecho `[inicio, fim)` por `@<token>` mais UM espaço, sem alterar o resto do
 * texto, e devolve o cursor logo depois do espaço inserido (RF-3, CA-5).
 */
export function inserirMencao(
  texto: string,
  trecho: Pick<MencaoEmEdicao, "inicio" | "fim">,
  token: string,
): { texto: string; cursor: number } {
  const inserido = `@${token} `;
  return {
    texto: texto.slice(0, trecho.inicio) + inserido + texto.slice(trecho.fim),
    cursor: trecho.inicio + inserido.length,
  };
}

/**
 * Membros cujo RÓTULO contém `consulta`, sem diferenciar maiúsculas e sem ignorar acentos
 * (Q3: igual ao `TemplateMenu`). Filtrar pelo rótulo faz o membro sem nome ser achado por
 * "sem nome" ou por um pedaço do id (RF-7). `semNome` é o texto já traduzido.
 */
export function filtrarMembros(
  membros: MembroMencionavel[],
  consulta: string,
  semNome?: string,
): MembroMencionavel[] {
  const q = consulta.toLowerCase();
  return membros.filter((m) => rotuloDoMembro(m, semNome).toLowerCase().includes(q));
}

/** O que o Composer deve fazer com uma tecla enquanto a lista está aberta. */
export type AcaoDoTeclado =
  | { tipo: "mover"; ativo: number }
  | { tipo: "selecionar"; indice: number }
  | { tipo: "fechar" }
  /** A tecla é do menu mas não faz nada (Enter sem resultado): `preventDefault` e mais nada. */
  | { tipo: "consumir" }
  /** A tecla segue para o `<textarea>` como de costume. */
  | { tipo: "ignorar" };

/**
 * Teclado do menu (RNF-1). `total` é o número de itens JÁ filtrados; `ativo` pode estar
 * fora da faixa se a lista encolheu, e vale como o último item.
 *
 *   ↑/↓     movem o item ativo, dando a volta
 *   Enter   seleciona — e NUNCA envia a nota; sem resultado é consumido (não envia nem insere)
 *   Esc     fecha, sem apagar o texto
 */
export function teclaNoMenu(key: string, ativo: number, total: number): AcaoDoTeclado {
  const atual = total > 0 ? Math.min(Math.max(ativo, 0), total - 1) : 0;
  switch (key) {
    case "ArrowDown":
      return total > 0 ? { tipo: "mover", ativo: (atual + 1) % total } : { tipo: "ignorar" };
    case "ArrowUp":
      return total > 0 ? { tipo: "mover", ativo: (atual - 1 + total) % total } : { tipo: "ignorar" };
    case "Enter":
      return total > 0 ? { tipo: "selecionar", indice: atual } : { tipo: "consumir" };
    case "Escape":
      return { tipo: "fechar" };
    default:
      return { tipo: "ignorar" };
  }
}

/** `id` do listbox e de cada opção, para o `aria-activedescendant` do textarea (T4). */
export const ID_DA_LISTA_DE_MENCAO = "mencao-lista";
export const idDaOpcaoDeMencao = (userId: string) => `mencao-opcao-${userId}`;

interface Props {
  open: boolean;
  /** O que foi digitado depois do `@`. */
  consulta: string;
  /** Todos os membros mencionáveis; o filtro é daqui. */
  membros: MembroMencionavel[];
  /** Índice do item ativo, na lista JÁ filtrada. */
  ativo: number;
  onAtivo: (indice: number) => void;
  onPick: (m: MembroMencionavel) => void;
  /**
   * Por que a lista pode estar vazia sem que "ninguém" case: a busca ainda corre ou falhou.
   * Sem isto o menu diria "Nenhum membro encontrado" enquanto carrega, o que é mentira.
   */
  estado?: "carregando" | "erro";
}

export function MentionMenu({ open, consulta, membros, ativo, onAtivo, onPick, estado }: Props) {
  const t = useT();
  if (!open) return null;
  const semNome = t("Membro sem nome");
  const filtrados = filtrarMembros(membros, consulta, semNome);

  return (
    <div
      id={ID_DA_LISTA_DE_MENCAO}
      className="absolute bottom-14 left-3 z-20 max-h-64 w-72 overflow-y-auto rounded-2xl border border-border bg-popover p-1 shadow-lg"
      role="listbox"
      aria-label={t("Mencionar membro")}
    >
      {filtrados.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          {estado === "carregando"
            ? t("Carregando…")
            : estado === "erro"
              ? t("Não foi possível carregar os membros.")
              : t("Nenhum membro encontrado")}
        </div>
      ) : (
        filtrados.map((m, i) => (
          <div
            key={m.user_id}
            id={idDaOpcaoDeMencao(m.user_id)}
            role="option"
            aria-selected={i === ativo}
            className={
              "cursor-pointer rounded-xl px-3 py-2 text-sm " + (i === ativo ? "bg-muted" : "hover:bg-muted")
            }
            // Sem isto o clique tira o foco do textarea e a seleção perde o cursor.
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => onAtivo(i)}
            onClick={() => onPick(m)}
          >
            {rotuloDoMembro(m, semNome)}
          </div>
        ))
      )}
    </div>
  );
}
