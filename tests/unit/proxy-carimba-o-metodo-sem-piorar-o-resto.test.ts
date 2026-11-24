/**
 * O `proxy.ts` agora monta os cabeçalhos da requisição ANTES de `NextResponse.next` para carimbar o
 * método HTTP (gate de expediente, PRD-01 / #67). O review do #88 (item 5) pediu a prova de que a
 * região mexida não ficou pior.
 *
 * O que foi MEDIDO (Next 16, `NextResponse.next` direto): o que se muta em `request.headers` /
 * `request.cookies` DEPOIS de `next()` não chega ao handler — nem antes do PR (que passava
 * `request.headers` por referência) nem depois. Então o `x-pathname` e a renovação de cookie feitos
 * pelo proxy nunca foram para o handler por esse caminho. Este arquivo trava o que importa agora:
 * o carimbo CHEGA, não é forjável, e o `x-pathname` de RESPOSTA segue intacto.
 *
 * Rota pública (`/login`), de propósito: o `proxy` devolve antes de criar o cliente Supabase.
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" },
}));

import { config, proxy } from "@/proxy";

describe("proxy: carimbo do método HTTP", () => {
  it("o carimbo chega ao handler e sobrescreve o que o cliente mandar (não é forjável)", async () => {
    const req = new NextRequest("http://localhost/login", {
      method: "POST",
      headers: { "x-metodo-http": "GET", "x-outro": "1" },
    });
    const res = await proxy(req);
    expect(res.headers.get("x-middleware-request-x-metodo-http")).toBe("POST");
    // Os cabeçalhos que já passavam continuam passando.
    expect(res.headers.get("x-middleware-override-headers")).toContain("x-outro");
  });

  it("o `x-pathname` de RESPOSTA e o `x-request-id` seguem estampados", async () => {
    const res = await proxy(new NextRequest("http://localhost/login", { method: "GET" }));
    expect(res.headers.get("x-pathname")).toBe("/login");
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("`x-pathname` por `request.headers.set` depois do next() não chega ao handler — como antes do PR", async () => {
    const res = await proxy(new NextRequest("http://localhost/login", { method: "GET" }));
    expect(res.headers.get("x-middleware-request-x-pathname")).toBeNull();
  });
});

describe("proxy: o único caminho que chega ao gate SEM o carimbo (review do #88, item 6)", () => {
  // O matcher é um regex único com lookahead negativo; o Next o ancora no caminho inteiro.
  const alcanca = (caminho: string) => new RegExp("^" + config.matcher[0] + "$").test(caminho);

  it("toda rota de API e toda página passam pelo proxy — logo, são carimbadas", () => {
    for (const c of ["/api/v1/conversations", "/api/v1/tasks/abc", "/app/inbox", "/login", "/api/v1/cron/x"]) {
      expect(alcanca(c), c).toBe(true);
    }
  });

  it("só arquivo ESTÁTICO escapa do proxy — e estático não chama requireRole", () => {
    for (const c of ["/_next/static/chunk.js", "/_next/image", "/favicon.ico", "/robots.txt", "/logo.svg", "/x.png"]) {
      expect(alcanca(c), c).toBe(false);
    }
  });
});
