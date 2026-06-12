import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, InMemoryChainStore, type AuditPayload } from "@oxford/audit";
import { IntervalScheduler, chainIntegrityJob } from "./scheduler.js";
import type { IntegrityReport } from "@oxford/audit";

describe("chainIntegrityJob", () => {
  it("reports ok for an intact chain", async () => {
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), fixedClock(new Date("2026-06-12T00:00:00Z")));
    await audit.record({ actorId: "a", entityType: "X", entityId: "1", action: "CREATE", after: {} });
    let report: IntegrityReport | null = null;
    await chainIntegrityJob(fixedClock(new Date("2026-06-12T00:00:00Z")), { audit }, (r) => (report = r))();
    expect(report!.ok).toBe(true);
  });
});

describe("IntervalScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs the scheduled job on its interval and stops cleanly", async () => {
    const scheduler = new IntervalScheduler();
    let runs = 0;
    scheduler.scheduleRecurring("integrity", 1000, async () => {
      runs += 1;
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(runs).toBe(3);
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(3000);
    expect(runs).toBe(3); // no further runs after stop
  });
});
