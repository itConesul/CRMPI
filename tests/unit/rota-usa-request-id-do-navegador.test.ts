/**
 * Toda rota de `app/api` tira o `requestId` de `requestIdDe(req)`, nunca de
 * `randomUUID()` solto.
 *
 * O navegador gera o `X-Request-Id` e MOSTRA esse ID no toast de falha
 * (`lib/api/client.ts`). Uma rota que cria o próprio UUID quebra a ponte: o ID que
 * a pessoa lê nunca aparece no log nem no audit do servidor, justo quando o servidor
 * não respondeu e o toast é o único rastro. Ver `lib/api/request-id.ts`.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");
const API = path.join(RAIZ, "app/api");

function rotas(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return rotas(p);
    return e.name === "route.ts" ? [p] : [];
  });
}

describe("o requestId da rota vem do navegador", () => {
  const arquivos = rotas(API);

  it("há rotas para vigiar (guarda de vacuidade)", () => {
    expect(arquivos.length).toBeGreaterThan(200);
  });

  it("nenhuma rota faz `requestId = randomUUID()`", () => {
    const infratoras = arquivos
      .filter((f) => /\brequestId\s*=\s*randomUUID\(\)/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(RAIZ, f));
    expect(infratoras).toEqual([]);
  });
});
