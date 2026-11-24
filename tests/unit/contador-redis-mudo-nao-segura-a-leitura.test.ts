/**
 * Um Redis que ACEITA a conexão e nunca responde não pode segurar o `GET /settings/expediente`
 * (PRD-01 / #67, T2d, RNF-5).
 *
 * Medido em 2026-11-24 (`@upstash/redis` 1.38.3): com `retry: false` e sem `signal`, a chamada seguia
 * pendente aos 8 s contra um servidor mudo. A faixa do shell chama a rota a cada 60 s, e o leitor do
 * contador roda nessa resposta — sem prazo, um Redis travado derrubaria a faixa de todo usuário
 * `admin`/`manager`. Com `signal`, a chamada aborta no prazo e vira `null` (a tela mostra `—`).
 *
 * Este teste NÃO mocka o cliente: o que se prova é o comportamento do cliente real contra um socket
 * real. O Redis falso do `contador.test.ts` não enxergaria isto.
 */
import net from "node:net";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  __reiniciarContadorParaTeste,
  contarBarrado,
  lerBarradosDoDia,
  PRAZO_DO_REDIS_MS,
} from "@/lib/expediente/contador";

const ORG = "00000000-0000-4000-8000-0000000000bb";
const AGORA = new Date("2026-11-24T15:00:00Z");
/** Folga sobre o prazo para o timer e o Windows; muito abaixo dos 8 s em que o cliente sem prazo seguia preso. */
const FOLGA_MS = 1500;

let servidor: net.Server;
const sockets: net.Socket[] = [];
let porta = 0;

const ambienteOriginal = {
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
};

beforeAll(async () => {
  servidor = net.createServer((s) => {
    sockets.push(s); // aceita e fica mudo
    s.on("error", () => undefined);
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  porta = (servidor.address() as net.AddressInfo).port;
});

afterAll(async () => {
  for (const s of sockets) s.destroy();
  await new Promise<void>((r) => servidor.close(() => r()));
});

beforeEach(() => {
  process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${porta}`;
  process.env.UPSTASH_REDIS_REST_TOKEN = "token-de-teste";
  __reiniciarContadorParaTeste();
});

afterEach(() => {
  if (ambienteOriginal.url === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = ambienteOriginal.url;
  if (ambienteOriginal.token === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  else process.env.UPSTASH_REDIS_REST_TOKEN = ambienteOriginal.token;
  __reiniciarContadorParaTeste();
});

async function medir<T>(fn: () => Promise<T>): Promise<{ valor: T; ms: number }> {
  const t0 = Date.now();
  const valor = await fn();
  return { valor, ms: Date.now() - t0 };
}

describe("Redis mudo: a leitura e a contagem expiram no prazo, sem lançar", () => {
  it("o prazo é curto: bem abaixo dos 8 s em que o cliente sem prazo seguia pendente", () => {
    expect(PRAZO_DO_REDIS_MS).toBeGreaterThan(0);
    expect(PRAZO_DO_REDIS_MS).toBeLessThanOrEqual(3000);
  });

  it("`lerBarradosDoDia` devolve `null` dentro do prazo, e a SEGUNDA leitura também (o `signal` é função, não um sinal fixo)", async () => {
    const primeira = await medir(() => lerBarradosDoDia(ORG, "UTC", AGORA));
    expect(primeira.valor).toBeNull();
    expect(primeira.ms).toBeLessThan(PRAZO_DO_REDIS_MS + FOLGA_MS);

    // O cliente é um singleton do módulo. Um `AbortSignal.timeout` fixo já estaria expirado aqui e a
    // segunda chamada voltaria na hora (medido: 1 ms): o que importa é que ela ESPERE o prazo cheio,
    // como a primeira, e termine em `null`.
    const segunda = await medir(() => lerBarradosDoDia(ORG, "UTC", AGORA));
    expect(segunda.valor).toBeNull();
    expect(segunda.ms).toBeGreaterThanOrEqual(PRAZO_DO_REDIS_MS - 300);
    expect(segunda.ms).toBeLessThan(PRAZO_DO_REDIS_MS + FOLGA_MS);
  }, 15_000);

  it("`contarBarrado` devolve `false` dentro do prazo e não lança (a regra de barrar não depende do contador)", async () => {
    const { valor, ms } = await medir(() => contarBarrado(ORG, "UTC", AGORA));
    expect(valor).toBe(false);
    expect(ms).toBeLessThan(PRAZO_DO_REDIS_MS + FOLGA_MS);
  }, 15_000);
});
