import { describe, expect, it } from "vitest";

import { requestIdDe } from "./request-id";

const req = (valor?: string) =>
  new Request("http://x/api", valor === undefined ? {} : { headers: { "x-request-id": valor } });

describe("requestIdDe", () => {
  it("reaproveita o UUID que o navegador enviou", () => {
    const id = "2a0ba04a-cdf0-4d35-afd4-1fce737fdb83";
    expect(requestIdDe(req(id))).toBe(id);
  });

  it("gera um UUID quando o header não vem", () => {
    expect(requestIdDe(req())).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each(["", "abc", "x".repeat(500), "2a0ba04a-cdf0-4d35-afd4-1fce737fdb83 forjado"])(
    "descarta valor que não é UUID: %j",
    (lixo) => {
      const id = requestIdDe(req(lixo));
      expect(id).not.toBe(lixo);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    },
  );
});
