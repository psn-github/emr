import { describe, expect, it } from "vitest";
import { fixedClock, asId } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { newBalance, validateWitness, reconcile, movementDirection } from "./controlled.js";
import { ControlledDrugsService } from "./controlled-service.js";
import { InMemoryControlledRegisterStore } from "./controlled-store.js";
import { InMemoryCatalogueStore } from "./store.js";
import type { CatalogueItem } from "./types.js";

describe("controlled-drugs register logic (pure)", () => {
  it("classifies movement direction", () => {
    expect(movementDirection("receipt")).toBe("in");
    expect(movementDirection("return")).toBe("in");
    expect(movementDirection("issue")).toBe("out");
    expect(movementDirection("wastage")).toBe("out");
    expect(movementDirection("destruction")).toBe("out");
    expect(movementDirection("adjustment")).toBe("set");
  });

  it("computes the running balance and refuses to go negative", () => {
    expect(newBalance(0, "receipt", 10)).toEqual({ ok: true, value: 10 });
    expect(newBalance(10, "issue", 4)).toEqual({ ok: true, value: 6 });
    expect(newBalance(6, "return", 2)).toEqual({ ok: true, value: 8 });
    expect(newBalance(8, "adjustment", 5)).toEqual({ ok: true, value: 5 }); // set to count
    expect(newBalance(0, "adjustment", 0)).toEqual({ ok: true, value: 0 }); // zero count is valid
    const neg = newBalance(3, "destruction", 4);
    expect(neg.ok).toBe(false);
    if (!neg.ok) expect(neg.error.detailKey).toBe("inventory.cd.negative");
  });

  it("rejects invalid quantities", () => {
    expect(detail(newBalance(0, "receipt", 0))).toBe("inventory.cd.quantity_invalid"); // in must be positive
    expect(detail(newBalance(10, "issue", 0))).toBe("inventory.cd.quantity_invalid"); // out must be positive
    expect(detail(newBalance(0, "receipt", -1))).toBe("inventory.cd.quantity_invalid");
    expect(detail(newBalance(0, "receipt", 1.5))).toBe("inventory.cd.quantity_invalid");
  });

  it("requires a distinct, named witness", () => {
    expect(validateWitness("a", "b").ok).toBe(true);
    expect(detail(validateWitness("a", " "))).toBe("inventory.cd.witness_required");
    expect(detail(validateWitness("a", "a"))).toBe("inventory.cd.witness_same_person");
  });

  it("reconciles a count against the book balance", () => {
    expect(reconcile(10, 10)).toEqual({ registerBalance: 10, physicalCount: 10, discrepancy: 0, matched: true });
    expect(reconcile(10, 8)).toEqual({ registerBalance: 10, physicalCount: 8, discrepancy: -2, matched: false });
  });
});

function build() {
  const clock = fixedClock(new Date("2026-06-20T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const catalogue = new InMemoryCatalogueStore();
  const svc = new ControlledDrugsService(new InMemoryControlledRegisterStore(), catalogue, audit, events);
  return { svc, catalogue };
}

const CD = "fentanyl-100";
const NONCD = "saline-1";
function item(id: string, controlled: boolean): CatalogueItem {
  return { id: asId<"CatalogueItem">(id), name: id, category: "drug", unit: "amp", packSize: 1, coldChain: false, controlled, parLevel: 0, preferredSupplierId: null };
}
const T = "2026-06-20T08:00:00Z";
const W = { witnessedBy: "nurse-2", reason: "routine", occurredAt: T };

describe("ControlledDrugsService", () => {
  it("keeps a witnessed running balance over receipt → issue → return", async () => {
    const { svc, catalogue } = build();
    await catalogue.saveItem(item(CD, true));
    await svc.record("nurse-1", { itemId: CD, lotNo: "L1", type: "receipt", quantity: 10, ...W });
    await svc.record("nurse-1", { itemId: CD, lotNo: "L1", type: "issue", quantity: 3, patientRef: "pat-1", ...W });
    const ret = await svc.record("nurse-1", { itemId: CD, lotNo: "L1", type: "return", quantity: 1, ...W });
    expect(ret.ok && ret.value.balanceAfter).toBe(8);
    expect(await svc.balance(CD)).toBe(8);
    expect((await svc.movements(CD)).map((m) => m.balanceAfter)).toEqual([10, 7, 8]);
  });

  it("blocks an unwitnessed/self-witnessed movement and a non-controlled or unknown item", async () => {
    const { svc, catalogue } = build();
    await catalogue.saveItem(item(CD, true));
    await catalogue.saveItem(item(NONCD, false));
    expect(detail(await svc.record("nurse-1", { itemId: CD, lotNo: "L1", type: "receipt", quantity: 5, witnessedBy: "nurse-1", reason: "r", occurredAt: T }))).toBe("inventory.cd.witness_same_person");
    expect(detail(await svc.record("nurse-1", { itemId: NONCD, lotNo: "L1", type: "receipt", quantity: 5, ...W }))).toBe("inventory.cd.not_controlled");
    expect(detail(await svc.record("nurse-1", { itemId: "ghost", lotNo: "L1", type: "receipt", quantity: 5, ...W }))).toBe("inventory.cd.item_not_found");
    // a balance-negative issue is blocked end-to-end
    expect(detail(await svc.record("nurse-1", { itemId: CD, lotNo: "L1", type: "issue", quantity: 1, ...W }))).toBe("inventory.cd.negative");
  });

  it("reconciles a physical count: a match makes no entry, a discrepancy posts a witnessed adjustment", async () => {
    const { svc, catalogue } = build();
    await catalogue.saveItem(item(CD, true));
    await svc.record("nurse-1", { itemId: CD, lotNo: "L1", type: "receipt", quantity: 10, ...W });

    const exact = await svc.reconcileCount("nurse-1", { itemId: CD, lotNo: "L1", physicalCount: 10, witnessedBy: "nurse-2", reason: "count", occurredAt: T });
    expect(exact.ok && exact.value.matched).toBe(true);
    expect(await svc.movements(CD)).toHaveLength(1); // no adjustment posted

    const short = await svc.reconcileCount("nurse-1", { itemId: CD, lotNo: "L1", physicalCount: 8, witnessedBy: "nurse-2", reason: "count", occurredAt: T });
    expect(short.ok && short.value.discrepancy).toBe(-2);
    expect(await svc.balance(CD)).toBe(8); // adjusted to the physical count
    const last = (await svc.movements(CD)).at(-1)!;
    expect(last.type).toBe("adjustment");
    expect(last.reason).toContain("discrepancy -2");

    // reconcile guards: witness + controlled-item checks flow through
    expect(detail(await svc.reconcileCount("nurse-1", { itemId: CD, lotNo: "L1", physicalCount: 5, witnessedBy: "nurse-1", reason: "c", occurredAt: T }))).toBe("inventory.cd.witness_same_person");
    expect(detail(await svc.reconcileCount("nurse-1", { itemId: "ghost", lotNo: "L1", physicalCount: 5, witnessedBy: "nurse-2", reason: "c", occurredAt: T }))).toBe("inventory.cd.item_not_found");
  });

  it("produces a period report with opening/closing balance", async () => {
    const { svc, catalogue } = build();
    await catalogue.saveItem(item(CD, true));
    await svc.record("nurse-1", { itemId: CD, lotNo: "L1", type: "receipt", quantity: 10, witnessedBy: "nurse-2", reason: "r", occurredAt: "2026-06-01T08:00:00Z" });
    await svc.record("nurse-1", { itemId: CD, lotNo: "L1", type: "issue", quantity: 4, witnessedBy: "nurse-2", reason: "r", occurredAt: "2026-06-15T08:00:00Z" });

    const rep = await svc.periodReport(CD, "2026-06-10T00:00:00Z", "2026-06-20T00:00:00Z");
    expect(rep.openingBalance).toBe(10); // the June-1 receipt is before the window
    expect(rep.closingBalance).toBe(6);
    expect(rep.movements).toHaveLength(1);

    // an empty window reports the running balance as both opening and closing
    const empty = await svc.periodReport(CD, "2026-07-01T00:00:00Z", "2026-07-31T00:00:00Z");
    expect(empty.openingBalance).toBe(6);
    expect(empty.closingBalance).toBe(6);
    expect(empty.movements).toHaveLength(0);
    // a report for an item with no movements at all is zeroed
    const none = await svc.periodReport("never", "2026-07-01T00:00:00Z", "2026-07-31T00:00:00Z");
    expect(none.openingBalance).toBe(0);
    expect(none.closingBalance).toBe(0);
  });
});

function detail(r: { ok: boolean; error?: { detailKey?: string } }): string | undefined {
  return r.ok ? undefined : r.error?.detailKey;
}
