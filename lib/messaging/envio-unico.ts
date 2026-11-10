/**
 * O MESMO ENVIO NÃO SAI DUAS VEZES PARA O CLIENTE.
 *
 * Duas causas diferentes duplicavam mensagem no WhatsApp, e cada camada abaixo
 * cobre uma:
 *
 *   A. IDEMPOTENCY-KEY. O cliente HTTP reenvia o POST sozinho quando há timeout
 *      ou erro de rede, sempre com o MESMO `Idempotency-Key`, e a rota ignorava o
 *      header — a doutrina o promete para todo POST de criação. Mesma chave, mesmo
 *      usuário: devolve a mensagem já criada, sem enviar de novo.
 *
 *   B. JANELA ANTI-DUPLO-ENVIO. Enter duas vezes ou duplo clique são DUAS
 *      requisições com chaves diferentes — a chave não os junta. O mesmo usuário,
 *      na mesma conversa, com o mesmo texto, em até JANELA_SEGUNDOS, é o mesmo
 *      envio. Preço consciente: quem quiser mandar "ok" duas vezes em menos de
 *      JANELA_SEGUNDOS não consegue; passado esse prazo, nada é barrado.
 *
 * ⚠️ Envio que FALHA libera as reservas. Barrar o reenvio de uma mensagem que não
 * saiu seria pior do que duplicar uma que saiu.
 *
 * ⚠️ Redis indisponível = SEM proteção, com aviso — o envio é o caminho de saída
 * do sistema inteiro e não pode parar porque um cache caiu.
 */
import { createHash } from "node:crypto";

import { ApiError } from "@/lib/api/types";

export const JANELA_SEGUNDOS = 15;
export const IDEMPOTENCIA_SEGUNDOS = 24 * 60 * 60;
const PENDENTE = "pendente";
const ESPERA_MAXIMA_MS = 8_000;
const INTERVALO_MS = 250;

/** O armazém das reservas. O de produção é Redis; o dos testes é memória. */
export interface ArmazemDeReservas {
  /** Grava só se a chave NÃO existe. `true` = reservou. */
  setNx(chave: string, valor: string, ttlSegundos: number): Promise<boolean>;
  get(chave: string): Promise<string | null>;
  set(chave: string, valor: string, ttlSegundos: number): Promise<void>;
  del(chave: string): Promise<void>;
}

export function armazemEmMemoria(agora: () => number = Date.now): ArmazemDeReservas {
  const m = new Map<string, { valor: string; expira: number }>();
  const vivo = (c: string) => {
    const e = m.get(c);
    if (!e) return null;
    if (e.expira <= agora()) {
      m.delete(c);
      return null;
    }
    return e;
  };
  return {
    async setNx(c, v, ttl) {
      if (vivo(c)) return false;
      m.set(c, { valor: v, expira: agora() + ttl * 1000 });
      return true;
    },
    async get(c) {
      return vivo(c)?.valor ?? null;
    },
    async set(c, v, ttl) {
      m.set(c, { valor: v, expira: agora() + ttl * 1000 });
    },
    async del(c) {
      m.delete(c);
    },
  };
}

export interface EnvioUnicoArgs {
  organizationId: string;
  userId: string;
  conversationId: string;
  type: string;
  body: string | null | undefined;
  idempotencyKey: string | null | undefined;
}

function chavesDoEnvio(a: EnvioUnicoArgs): { idem: string | null; janela: string | null } {
  const base = `envio:${a.organizationId}:${a.userId}`;
  const chave = a.idempotencyKey?.trim();
  const texto = a.body?.trim() ?? "";
  const hash = createHash("sha256").update(texto).digest("hex").slice(0, 32);
  return {
    idem: chave ? `${base}:idem:${chave.slice(0, 120)}` : null,
    // Janela só para TEXTO: reenviar a mesma foto em 15s é legítimo e a mídia não
    // tem o corpo como identidade.
    janela:
      a.type === "text" && texto.length > 0
        ? `${base}:janela:${a.conversationId}:${hash}`
        : null,
  };
}

const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Executa `enviar` no máximo uma vez por envio lógico. Devolve `replay: true`
 * quando era repetição e a mensagem devolvida é a do primeiro envio.
 */
export async function envioUnico<T extends { id: string; status?: string }>(
  args: EnvioUnicoArgs,
  armazem: ArmazemDeReservas,
  enviar: () => Promise<T>,
  buscar: (id: string) => Promise<T | null>,
  opts: { esperaMaximaMs?: number; requestId?: string } = {},
): Promise<{ replay: boolean; message: T }> {
  const { idem, janela } = chavesDoEnvio(args);
  const tomadas: Array<{ chave: string; ttl: number }> = [];
  const quer: Array<{ chave: string; ttl: number }> = [];
  if (idem) quer.push({ chave: idem, ttl: IDEMPOTENCIA_SEGUNDOS });
  if (janela) quer.push({ chave: janela, ttl: JANELA_SEGUNDOS });

  const soltar = async () => {
    await Promise.all(tomadas.map((t) => armazem.del(t.chave).catch(() => undefined)));
  };

  for (const q of quer) {
    let reservou = true; // sem armazém, sem proteção: o envio não pode parar
    try {
      reservou = await armazem.setNx(q.chave, PENDENTE, q.ttl);
    } catch {
      reservou = true;
    }
    if (reservou) {
      tomadas.push(q);
      continue;
    }

    // Repetição. Solta o que ESTA chamada tomou e devolve a mensagem do primeiro.
    await soltar();
    const limite = Date.now() + (opts.esperaMaximaMs ?? ESPERA_MAXIMA_MS);
    for (;;) {
      const valor = await armazem.get(q.chave).catch(() => null);
      if (valor && valor !== PENDENTE) {
        const existente = await buscar(valor);
        if (existente) return { replay: true, message: existente };
        break;
      }
      if (valor === null || Date.now() >= limite) break;
      await dorme(INTERVALO_MS);
    }
    throw new ApiError(
      409,
      "duplicate_send_in_flight",
      undefined,
      opts.requestId ?? "",
      "Esta mensagem já está sendo enviada.",
    );
  }

  let message: T;
  try {
    message = await enviar();
  } catch (err) {
    await soltar();
    throw err;
  }
  if (message.status === "failed") {
    await soltar();
    return { replay: false, message };
  }
  await Promise.all(
    tomadas.map((t) => armazem.set(t.chave, message.id, t.ttl).catch(() => undefined)),
  );
  return { replay: false, message };
}
