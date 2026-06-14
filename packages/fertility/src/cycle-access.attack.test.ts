// ADVERSARIAL SELF-REVIEW (identity / Kuwaiti-law gate) — prove the marriage
// hard-gate at cycle creation: a TREATMENT cycle cannot be created for a couple
// that isn't verified, while PERSON-SCOPED preservation is allowed unmarried
// (ADR-0015/AMD-0002). The gate is the same registry check, injected.
import { describe, expect, it } from "vitest";
import { fixedClock, preconditionFailed, type Result, type AppError } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { CycleService } from "./cycle-service.js";
import { InMemoryCycleStore } from "./store.js";
import { InMemoryReasonCodeStore } from "./reason-codes.js";
import type { FertilityGate } from "./gate.js";

const unverified: FertilityGate = {
  assertMayTreat: async (): Promise<Result<void, AppError>> => ({ ok: false, error: preconditionFailed("no marriage", "registry.marriage.unverified") }),
};

function svc(gate: FertilityGate) {
  const clock = fixedClock(new Date("2026-06-13T08:00:00Z"));
  return new CycleService(
    new InMemoryCycleStore(),
    new AuditLog(new InMemoryChainStore<AuditPayload>(), clock),
    new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock),
    clock,
    gate,
    new InMemoryReasonCodeStore(),
  );
}

describe("ADVERSARIAL: marriage gate at cycle creation", () => {
  it("[attack] treatment cycle for an UNVERIFIED couple is rejected", async () => {
    const r = await svc(unverified).createTreatmentCycle("doc-1", "icsi", "couple-x");
    console.log("[attack] ICSI cycle, unverified couple →", r.ok ? "CREATED (FAIL)" : `REJECTED (${r.ok ? "" : r.error.detailKey})`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("registry.marriage.unverified");
  });

  it("preservation cycle is permitted person-scoped (no couple, no gate)", async () => {
    const cycle = await svc(unverified).createPreservationCycle("doc-1", "single-woman-1");
    console.log("[control] preservation cycle, single person → CREATED", cycle.owner);
    expect(cycle.owner).toEqual({ kind: "person", personId: "single-woman-1" });
  });
});
