import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog } from "./audit-log.js";
import { verifyChain } from "./chain.js";
import { InMemoryChainStore } from "./store.js";
import type { AuditPayload } from "./types.js";

const clock = () => fixedClock(new Date("2026-06-12T08:00:00.000Z"));

describe("AuditLog", () => {
  it("records a mutation with who/what/when/before/after", async () => {
    const c = clock();
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), c);
    const rec = await audit.record({
      actorId: "staff-1",
      entityType: "Person",
      entityId: "person-1",
      action: "UPDATE",
      before: { phone: "old" },
      after: { phone: "new" },
    });
    expect(rec.seq).toBe(1);
    expect(rec.occurredAt).toBe("2026-06-12T08:00:00.000Z");
    expect(rec.payload).toEqual({
      actorId: "staff-1",
      entityType: "Person",
      entityId: "person-1",
      action: "UPDATE",
      before: { phone: "old" },
      after: { phone: "new" },
    });
  });

  it("defaults before/after to null for non-mutation events", async () => {
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock());
    const rec = await audit.record({
      actorId: "staff-1",
      entityType: "Session",
      entityId: "staff-1",
      action: "LOGIN",
    });
    expect(rec.payload.before).toBeNull();
    expect(rec.payload.after).toBeNull();
  });

  it("chains multiple entries and verifies intact", async () => {
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock());
    await audit.record({ actorId: "a", entityType: "Cycle", entityId: "1", action: "CREATE", after: { x: 1 } });
    await audit.record({ actorId: "a", entityType: "Cycle", entityId: "1", action: "UPDATE", before: { x: 1 }, after: { x: 2 } });
    const entries = await audit.entries();
    expect(entries.map((e) => e.seq)).toEqual([1, 2]);
    expect(entries[1]!.prevHash).toBe(entries[0]!.hash);
    expect((await audit.verifyIntegrity()).ok).toBe(true);
  });

  it("exports the ordered audit trail for one entity (one-click compliance export)", async () => {
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock());
    await audit.record({ actorId: "a", entityType: "Invoice", entityId: "inv-1", action: "CREATE", after: { total: 100 } });
    await audit.record({ actorId: "a", entityType: "Payment", entityId: "pay-1", action: "CREATE", after: { amount: 50 } });
    await audit.record({ actorId: "a", entityType: "Invoice", entityId: "inv-1", action: "UPDATE", before: { total: 100 }, after: { total: 120 } });

    const trail = await audit.entriesForEntity("Invoice", "inv-1");
    expect(trail.map((r) => r.seq)).toEqual([1, 3]); // only inv-1's records, in order
    expect(trail.every((r) => r.payload.entityType === "Invoice" && r.payload.entityId === "inv-1")).toBe(true);
    // the export keeps chain fields, so it verifies against the full chain
    expect((await audit.verifyIntegrity()).ok).toBe(true);
    expect(await audit.entriesForEntity("Invoice", "nope")).toEqual([]);
  });

  it("verifyIntegrity catches tampering with a recorded before/after", async () => {
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock());
    await audit.record({ actorId: "a", entityType: "Invoice", entityId: "1", action: "CREATE", after: { total: 100 } });
    await audit.record({ actorId: "a", entityType: "Invoice", entityId: "1", action: "UPDATE", before: { total: 100 }, after: { total: 120 } });

    // Simulate someone editing history at rest: rewrite the second entry's "after".
    const recorded = await audit.entries();
    const tampered = recorded.map((r) =>
      r.seq === 2 ? { ...r, payload: { ...r.payload, after: { total: 0 } } } : r,
    );
    const result = verifyChain(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ seq: 2, reason: "hash-mismatch" });
  });
});
