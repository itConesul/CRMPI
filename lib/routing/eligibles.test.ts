import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadEligibleAttendants } from "./eligibles";

function fixture(over: Record<string, unknown> = {}) {
  const filters: Array<[string, string, unknown]> = [];
  const rows: Record<string, unknown> = {
    channel_sessions: { id: "channel" }, channel_routing_policies: null,
    channel_routing_responsibles: [], user_organizations: [{ user_id: "ana" }],
    attendant_availability: [{ user_id: "ana", capacity: 2, schedule: {} }],
    conversations: [], conversation_assignment_events: [], ...over,
  };
  const db = { from(table: string) {
    const q = {
      select() { return q; }, order() { return q; },
      eq(key: string, value: unknown) { filters.push([table, key, value]); return q; },
      is(key: string, value: unknown) { filters.push([table, key, value]); return q; },
      in(key: string, value: unknown) { filters.push([table, key, value]); return q; },
      maybeSingle() { return Promise.resolve({ data: rows[table], error: null }); },
      then(resolve: (x: unknown) => unknown) {
        return Promise.resolve(rows[table] instanceof Error
          ? { data: null, error: rows[table] }
          : { data: rows[table], error: null }).then(resolve);
      },
    }; return q;
  } } as unknown as SupabaseClient;
  return { db, filters };
}
const scope = { kind: "conversation_channel", channelSessionId: "channel" } as const;
const now = new Date("2026-09-06T15:00:00Z");
describe("elegibilidade com origem explícita", () => {
  it("política vazia não cai no conjunto legado", async () => {
    const { db } = fixture({ channel_routing_policies: { id: "policy" } });
    expect(await loadEligibleAttendants(db, "org", now, scope)).toEqual([]);
  });
  it("membro revogado não recebe mesmo com disponibilidade legada", async () => {
    const { db } = fixture({ user_organizations: [] });
    expect(await loadEligibleAttendants(db, "org", now, scope)).toEqual([]);
  });
  it("capacidade é global e histórico é apenas do canal, com org nas duas tabelas", async () => {
    const { db, filters } = fixture();
    expect(await loadEligibleAttendants(db, "org", now, scope)).toMatchObject([{ userId: "ana" }]);
    expect(filters).toContainEqual(["conversation_assignment_events", "conversations.channel_session_id", "channel"]);
    expect(filters).toContainEqual(["conversation_assignment_events", "conversations.organization_id", "org"]);
    expect(filters).not.toContainEqual(["conversations", "channel_session_id", "channel"]);
  });
  it("resumo global não consulta política", async () => {
    const { db, filters } = fixture();
    await loadEligibleAttendants(db, "org", now, { kind: "organization_summary" });
    expect(filters.some(([table]) => table === "channel_routing_policies")).toBe(false);
  });
  describe("expediente da organização (RF-12 e RF-6)", () => {
    // `now` é um domingo 12:00 em São Paulo; a janela é só de segunda, 08:00–09:00 ⇒ FORA do expediente.
    const foraDoExpediente = {
      organizations: {
        settings: { business_hours: { timezone: "America/Sao_Paulo", windows: [{ dow: 1, start: "08:00", end: "09:00" }] } },
      },
    };
    const equipe = {
      user_organizations: [
        { user_id: "ana", role: "agent" },
        { user_id: "bia", role: "manager" },
        { user_id: "cris", role: "admin" },
      ],
      attendant_availability: [
        { user_id: "ana", capacity: 2, schedule: {} },
        { user_id: "bia", capacity: 2, schedule: {} },
        { user_id: "cris", capacity: 2, schedule: {} },
      ],
    };

    it("fora do expediente só o `agent` sai da distribuição; manager e admin continuam elegíveis", async () => {
      const { db } = fixture({ ...equipe, ...foraDoExpediente });
      const ids = (await loadEligibleAttendants(db, "org", now, scope)).map((c) => c.userId).sort();
      expect(ids).toEqual(["bia", "cris"]);
    });

    it("sem expediente configurado o `agent` segue elegível (comportamento de antes)", async () => {
      const { db } = fixture({ ...equipe });
      const ids = (await loadEligibleAttendants(db, "org", now, scope)).map((c) => c.userId).sort();
      expect(ids).toEqual(["ana", "bia", "cris"]);
    });
  });
  it("canal inexistente não autoriza fallback", async () => {
    const { db } = fixture({ channel_sessions: null });
    await expect(loadEligibleAttendants(db, "org", now, scope)).rejects.toThrow("routing_channel_invalid");
  });
  it("erro de banco não vira sem elegível", async () => {
    const { db } = fixture({ attendant_availability: new Error("offline") });
    await expect(loadEligibleAttendants(db, "org", now, scope)).rejects.toThrow("offline");
  });
});
