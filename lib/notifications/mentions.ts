export function tokensDeMencao(body: string): string[] {
  const hits = body.match(/@[\p{L}\p{N}._-]+/gu) ?? [];
  return hits.map((t) => t.slice(1).toLowerCase());
}

export function mencaoAtingeUsuario(
  body: string,
  user: { id: string; email: string; full_name: string | null },
): boolean {
  const tokens = tokensDeMencao(body);
  if (tokens.length === 0) return false;
  if (tokens.includes(user.id.toLowerCase())) return true;
  const email = user.email.trim().toLowerCase();
  if (!email) return false;
  const local = email.split("@")[0] ?? "";
  if (tokens.includes(email) || (local && tokens.includes(local))) return true;
  const name = user.full_name?.trim().toLowerCase() ?? "";
  if (!name) return false;
  const first = name.split(/\s+/)[0] ?? "";
  const slug = name.replace(/\s+/g, "");
  return tokens.includes(first) || tokens.includes(slug);
}

/** O que o autocomplete sabe de um membro: `team/assignable` não devolve e-mail (PII). */
export interface MembroMencionavel {
  user_id: string;
  full_name: string | null;
}

// Um token de menção é `@[\p{L}\p{N}._-]+`: o nome sem espaços só serve se couber inteiro.
const CABE_NO_TOKEN = /^[\p{L}\p{N}._-]+$/u;

/**
 * O parser devolve `false` com e-mail vazio ANTES de olhar o nome (`mencaoAtingeUsuario`),
 * e o cliente não tem e-mail. Este marcador, derivado do id, não casa com token por nome
 * nenhum. Tirá-lo faz todo token por nome falhar em silêncio — vigiado em `mentions.test.ts`
 * (bloco "contrato"), que usa ESTA função e não uma cópia do marcador.
 */
export function comoUsuario(m: MembroMencionavel): { id: string; email: string; full_name: string | null } {
  return { id: m.user_id, email: `${m.user_id}@marcador.invalid`, full_name: m.full_name };
}

/**
 * Token (sem o `@`) que o autocomplete insere ao selecionar `m`. `todos` é a lista inteira
 * de `team/assignable`, inclusive `m`.
 *
 * Prefere o nome sem espaços, mas só quando ele atinge `m` e NENHUM outro membro, avaliado
 * pelo próprio `mencaoAtingeUsuario` (todas as regras, primeiro nome inclusive). Senão
 * — sem nome, apóstrofo, parênteses ou colisão, como "Ana" ao lado de "Ana Silva" — cai
 * para o `user_id`, o único token que o parser casa sem ambiguidade.
 */
export function tokenDeMencao(m: MembroMencionavel, todos: MembroMencionavel[]): string {
  const nome = m.full_name?.trim().replace(/\s+/g, "") ?? "";
  if (nome && CABE_NO_TOKEN.test(nome)) {
    const corpo = `@${nome}`;
    const atingeEle = mencaoAtingeUsuario(corpo, comoUsuario(m));
    const atingeOutro = todos.some(
      (o) => o.user_id !== m.user_id && mencaoAtingeUsuario(corpo, comoUsuario(o)),
    );
    if (atingeEle && !atingeOutro) return nome;
  }
  return m.user_id;
}

/**
 * Rótulo do membro na lista: o `full_name`, ou `Membro sem nome · <8 primeiros do user_id>`.
 * `semNome` recebe o texto já traduzido (o componente passa `t("Membro sem nome")`); o
 * padrão é o pt-BR, para uso fora de componente.
 */
export function rotuloDoMembro(m: MembroMencionavel, semNome = "Membro sem nome"): string {
  const nome = m.full_name?.trim();
  return nome ? nome : `${semNome} · ${m.user_id.slice(0, 8)}`;
}
