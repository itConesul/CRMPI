/**
 * O armazém de produção das reservas de envio: Redis (Upstash REST) quando
 * configurado, memória do processo quando não. Redis configurado e inalcançável
 * NÃO derruba o envio: cada operação tem teto de tempo e erro vira "sem proteção"
 * (ver `envio-unico.ts`). Mesmo padrão de `lib/ai/rag/debounce.ts`.
 */
import { Redis } from "@upstash/redis";

import { env } from "@/lib/env";
import { validarConfigRedisRest } from "@/lib/redis-config";

import { armazemEmMemoria, type ArmazemDeReservas } from "./envio-unico";

const TETO_MS = 1_500;

let _redis: Redis | null | undefined;
let _memoria: ArmazemDeReservas | null = null;

function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const config = validarConfigRedisRest(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
  _redis = config.ok
    ? new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })
    : null;
  return _redis;
}

function comTeto<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error("redis_timeout")), TETO_MS)),
  ]);
}

export function armazemDeProducao(): ArmazemDeReservas {
  const r = redis();
  if (!r) return (_memoria ??= armazemEmMemoria());
  return {
    async setNx(chave, valor, ttl) {
      return (await comTeto(r.set(chave, valor, { nx: true, ex: ttl }))) === "OK";
    },
    async get(chave) {
      const v = await comTeto(r.get<string>(chave));
      return typeof v === "string" ? v : null;
    },
    async set(chave, valor, ttl) {
      await comTeto(r.set(chave, valor, { ex: ttl }));
    },
    async del(chave) {
      await comTeto(r.del(chave));
    },
  };
}
