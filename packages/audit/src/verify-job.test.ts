import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog } from "./audit-log.js";
import { InMemoryChainStore } from "./store.js";
import type { AuditPayload } from "./types.js";
import { runChainIntegrityCheck, type VerifiableChain } from "./verify-job.js";

describe("runChainIntegrityCheck", () => {
  it("reports ok when every chain verifies", async () => {
    const clock = fixedClock(new Date("2026-06-12T09:00:00.000Z"));
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
    await audit.record({ actorId: "a", entityType: "X", entityId: "1", action: "CREATE", after: {} });

    const report = await runChainIntegrityCheck(clock, { audit });
    expect(report.ok).toBe(true);
    expect(report.checkedAt).toBe("2026-06-12T09:00:00.000Z");
    expect(report.results).toEqual([{ name: "audit", ok: true, break: null }]);
  });

  it("reports the break when a chain is tampered", async () => {
    const clock = fixedClock(new Date("2026-06-12T09:00:00.000Z"));
    const broken: VerifiableChain = {
      verifyIntegrity: async () => ({ ok: false, error: { seq: 4, reason: "hash-mismatch" } }),
    };
    const good: VerifiableChain = {
      verifyIntegrity: async () => ({ ok: true, value: undefined }),
    };

    const report = await runChainIntegrityCheck(clock, { events: broken, audit: good });
    expect(report.ok).toBe(false);
    expect(report.results).toContainEqual({
      name: "events",
      ok: false,
      break: { seq: 4, reason: "hash-mismatch" },
    });
    expect(report.results).toContainEqual({ name: "audit", ok: true, break: null });
  });
});
