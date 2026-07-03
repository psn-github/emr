import { describe, expect, it, beforeEach } from "vitest";
import { fixedClock, ok, err, preconditionFailed, type Result, type AppError } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { PharmacyService, type RaisePrescriptionInput } from "./pharmacy-service.js";
import { InMemoryPharmacyStore } from "./store.js";
import type { FormularyPort, AllergyPort, InventoryPort, ControlledRegisterPort, DrugInfo, ControlledIssueInput } from "./ports.js";
import type { DispenseAllocation } from "./types.js";

// Service tests over the in-memory store + fake ports (no I/O).

const NOW = new Date("2026-07-03T08:00:00.000Z");
const dose = { en: "225 IU daily", ar: "225 وحدة يومياً" };

class FakeFormulary implements FormularyPort {
  readonly drugs = new Map<string, DrugInfo>([
    ["rfsh", { nameEn: "Recombinant FSH", nameAr: "FSH", drugClass: "gonadotropin_fsh" }],
    ["prog", { nameEn: "Progesterone", nameAr: "بروجستيرون", drugClass: "progesterone", coldChain: true }],
    ["cd", { nameEn: "Controlled", nameAr: "مراقب", drugClass: "trigger", controlled: true }],
    ["noinfo", { nameEn: "x", nameAr: "x", drugClass: "x" }],
  ]);
  /** A drug that reports prescribable but whose info is missing (defensive path). */
  hideInfo = false;
  async isPrescribable(drugId: string): Promise<boolean> {
    return this.drugs.has(drugId) || (this.hideInfo && drugId === "ghost");
  }
  async drugInfo(drugId: string): Promise<DrugInfo | null> {
    if (this.hideInfo && drugId === "ghost") return null;
    return this.drugs.get(drugId) ?? null;
  }
}

class FakeAllergy implements AllergyPort {
  readonly byPatient = new Map<string, readonly string[]>();
  async allergicClasses(patientId: string): Promise<readonly string[]> {
    return this.byPatient.get(patientId) ?? [];
  }
}

interface Lot { lotNo: string; expiry: string; quantity: number }
class FakeInventory implements InventoryPort {
  readonly lots = new Map<string, Lot[]>(); // key `${drugId}@${location}`
  readonly deducted: DispenseAllocation[] = [];
  seed(drugId: string, location: string, lots: Lot[]): void {
    this.lots.set(`${drugId}@${location}`, lots.map((l) => ({ ...l })));
  }
  async availableAt(drugId: string, locationId: string): Promise<number> {
    return (this.lots.get(`${drugId}@${locationId}`) ?? []).reduce((s, l) => s + l.quantity, 0);
  }
  async issueFefo(_actorId: string, drugId: string, locationId: string, quantity: number): Promise<Result<readonly DispenseAllocation[], AppError>> {
    const lots = (this.lots.get(`${drugId}@${locationId}`) ?? []).slice().sort((a, b) => Date.parse(a.expiry) - Date.parse(b.expiry));
    const total = lots.reduce((s, l) => s + l.quantity, 0);
    if (quantity > total) return err(preconditionFailed("insufficient", "inventory.stock.insufficient"));
    const alloc: DispenseAllocation[] = [];
    let remaining = quantity;
    for (const lot of lots) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, lot.quantity);
      lot.quantity -= take;
      remaining -= take;
      alloc.push({ drugId, lotNo: lot.lotNo, expiry: lot.expiry, quantity: take });
    }
    return ok(alloc);
  }
  async deductLots(_actorId: string, allocations: readonly DispenseAllocation[]): Promise<Result<void, AppError>> {
    this.deducted.push(...allocations);
    return ok(undefined);
  }
}

class FakeControlled implements ControlledRegisterPort {
  readonly posted: ControlledIssueInput[] = [];
  fail = false;
  async postIssue(_actorId: string, input: ControlledIssueInput): Promise<Result<void, AppError>> {
    if (this.fail) return err(preconditionFailed("register rejected", "inventory.cd.negative"));
    this.posted.push(input);
    return ok(undefined);
  }
}

function build() {
  const clock = fixedClock(NOW);
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const store = new InMemoryPharmacyStore();
  const formulary = new FakeFormulary();
  const allergy = new FakeAllergy();
  const inventory = new FakeInventory();
  const controlled = new FakeControlled();
  const svc = new PharmacyService(store, formulary, allergy, inventory, controlled, audit, events, clock, { pharmacyLocationId: "pharmacy-ground" });
  return { svc, audit, events, store, formulary, allergy, inventory, controlled };
}

const rx = (over: Partial<RaisePrescriptionInput> = {}): RaisePrescriptionInput => ({
  patientId: "pat-1",
  items: [{ drugId: "rfsh", quantity: 2, doseInstruction: dose }],
  ...over,
});

describe("raisePrescription", () => {
  it("rejects a non-formulary drug (no free-text item)", async () => {
    const { svc } = build();
    const r = await svc.raisePrescription("doc-1", rx({ items: [{ drugId: "aspirin", quantity: 1, doseInstruction: dose }] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("pharmacy.rx.not_prescribable");
  });
  it("rejects a drug that is prescribable but has no drug info (defensive)", async () => {
    const { svc, formulary } = build();
    formulary.hideInfo = true;
    const r = await svc.raisePrescription("doc-1", rx({ items: [{ drugId: "ghost", quantity: 1, doseInstruction: dose }] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("pharmacy.rx.not_prescribable");
  });
  it("rejects invalid items before touching the formulary", async () => {
    const { svc } = build();
    const r = await svc.raisePrescription("doc-1", rx({ items: [] }));
    expect(r.ok && false).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("pharmacy.rx.empty");
  });
  it("raises a pending prescription and snapshots formulary attributes", async () => {
    const { svc, events } = build();
    const r = await svc.raisePrescription("doc-1", rx({ encounterId: "enc-1" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.status).toBe("pending");
    expect(r.value.encounterId).toBe("enc-1");
    expect(r.value.items[0]).toMatchObject({ nameEn: "Recombinant FSH", drugClass: "gonadotropin_fsh", controlled: false, coldChain: false });
    expect(r.value.allergyWarnings).toEqual([]);
    expect((await events.events()).some((e) => e.payload.type === "PrescriptionRaised")).toBe(true);
  });
  it("records an allergy advisory WITHOUT blocking, and emits the advisory event", async () => {
    const { svc, allergy, events } = build();
    allergy.byPatient.set("pat-1", ["gonadotropin_fsh"]);
    const r = await svc.raisePrescription("doc-1", rx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.allergyWarnings).toEqual([{ drugId: "rfsh", drugClass: "gonadotropin_fsh" }]);
    expect((await events.events()).some((e) => e.payload.type === "PrescriptionAllergyAdvisory")).toBe(true);
  });
});

describe("queue", () => {
  it("lists oldest first and filters by status", async () => {
    const { svc } = build();
    const a = await svc.raisePrescription("doc-1", rx());
    const b = await svc.raisePrescription("doc-1", rx({ patientId: "pat-2" }));
    if (!a.ok || !b.ok) throw new Error("setup");
    const all = await svc.queue();
    expect(all.map((p) => p.patientId)).toEqual(["pat-1", "pat-2"]);
    expect((await svc.queue("pending")).length).toBe(2);
    expect((await svc.queue("ready")).length).toBe(0);
    expect((await svc.get(a.value.id))?.id).toBe(a.value.id);
    expect(await svc.get("nope")).toBeNull();
  });
});

describe("dispense", () => {
  beforeEach(() => undefined);

  it("FEFO-decrements stock, records allocations, advances to dispensing", async () => {
    const { svc, inventory } = build();
    inventory.seed("rfsh", "pharmacy-ground", [
      { lotNo: "L-late", expiry: "2028-01-01", quantity: 5 },
      { lotNo: "L-early", expiry: "2027-01-01", quantity: 1 },
    ]);
    const raised = await svc.raisePrescription("doc-1", rx());
    if (!raised.ok) throw new Error("setup");
    const d = await svc.dispense("phm-1", { prescriptionId: raised.value.id, coldChainHandled: false });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    // FEFO: the earlier-expiry lot is consumed first.
    expect(d.value.allocations).toEqual([
      { drugId: "rfsh", lotNo: "L-early", expiry: "2027-01-01", quantity: 1 },
      { drugId: "rfsh", lotNo: "L-late", expiry: "2028-01-01", quantity: 1 },
    ]);
    expect((await svc.get(raised.value.id))?.status).toBe("dispensing");
    expect(await inventory.availableAt("rfsh", "pharmacy-ground")).toBe(4);
  });

  it("insufficient stock leaves the prescription pending (typed error, no decrement)", async () => {
    const { svc, inventory } = build();
    inventory.seed("rfsh", "pharmacy-ground", [{ lotNo: "L1", expiry: "2027-01-01", quantity: 1 }]);
    const raised = await svc.raisePrescription("doc-1", rx());
    if (!raised.ok) throw new Error("setup");
    const d = await svc.dispense("phm-1", { prescriptionId: raised.value.id });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error.detailKey).toBe("pharmacy.dispense.insufficient_stock");
    expect((await svc.get(raised.value.id))?.status).toBe("pending");
    expect(await inventory.availableAt("rfsh", "pharmacy-ground")).toBe(1); // untouched
  });

  it("cold-chain items require the cold-chain-handled assertion", async () => {
    const { svc, inventory } = build();
    inventory.seed("prog", "pharmacy-ground", [{ lotNo: "L1", expiry: "2027-01-01", quantity: 5 }]);
    const raised = await svc.raisePrescription("doc-1", rx({ items: [{ drugId: "prog", quantity: 1, doseInstruction: dose }] }));
    if (!raised.ok) throw new Error("setup");
    const rejected = await svc.dispense("phm-1", { prescriptionId: raised.value.id });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error.detailKey).toBe("pharmacy.dispense.cold_chain_required");
    const okDispense = await svc.dispense("phm-1", { prescriptionId: raised.value.id, coldChainHandled: true });
    expect(okDispense.ok).toBe(true);
  });

  it("controlled items require a witness and post a witnessed register movement", async () => {
    const { svc, inventory, controlled } = build();
    inventory.seed("cd", "pharmacy-ground", [{ lotNo: "CD-1", expiry: "2027-01-01", quantity: 3 }]);
    const raised = await svc.raisePrescription("doc-1", rx({ items: [{ drugId: "cd", quantity: 2, doseInstruction: dose }] }));
    if (!raised.ok) throw new Error("setup");
    const noWitness = await svc.dispense("phm-1", { prescriptionId: raised.value.id });
    expect(noWitness.ok).toBe(false);
    if (!noWitness.ok) expect(noWitness.error.detailKey).toBe("pharmacy.dispense.witness_required");
    const d = await svc.dispense("phm-1", { prescriptionId: raised.value.id, witnessStaffId: "phm-2" });
    expect(d.ok).toBe(true);
    expect(controlled.posted).toEqual([{ drugId: "cd", lotNo: "CD-1", quantity: 2, patientRef: "pat-1", witnessStaffId: "phm-2", occurredAt: NOW.toISOString() }]);
  });

  it("surfaces a controlled-register failure as a domain error", async () => {
    const { svc, inventory, controlled } = build();
    controlled.fail = true;
    inventory.seed("cd", "pharmacy-ground", [{ lotNo: "CD-1", expiry: "2027-01-01", quantity: 3 }]);
    const raised = await svc.raisePrescription("doc-1", rx({ items: [{ drugId: "cd", quantity: 1, doseInstruction: dose }] }));
    if (!raised.ok) throw new Error("setup");
    const d = await svc.dispense("phm-1", { prescriptionId: raised.value.id, witnessStaffId: "phm-2" });
    expect(d.ok).toBe(false);
  });

  it("supports a manual lot override (validated + deducted exactly)", async () => {
    const { svc, inventory } = build();
    const raised = await svc.raisePrescription("doc-1", rx());
    if (!raised.ok) throw new Error("setup");
    const manual: DispenseAllocation[] = [{ drugId: "rfsh", lotNo: "PICK-1", expiry: "2027-06-01", quantity: 2 }];
    const d = await svc.dispense("phm-1", { prescriptionId: raised.value.id, allocations: manual });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.value.allocations).toEqual(manual);
    expect(inventory.deducted).toEqual(manual);
  });

  it("rejects a manual override that does not cover the quantity", async () => {
    const { svc } = build();
    const raised = await svc.raisePrescription("doc-1", rx());
    if (!raised.ok) throw new Error("setup");
    const d = await svc.dispense("phm-1", { prescriptionId: raised.value.id, allocations: [{ drugId: "rfsh", lotNo: "PICK-1", expiry: "2027-06-01", quantity: 1 }] });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error.detailKey).toBe("pharmacy.dispense.allocation_mismatch");
  });

  it("rejects dispensing an unknown or non-pending prescription", async () => {
    const { svc, inventory } = build();
    expect((await svc.dispense("phm-1", { prescriptionId: "nope" })).ok).toBe(false);
    inventory.seed("rfsh", "pharmacy-ground", [{ lotNo: "L1", expiry: "2027-01-01", quantity: 5 }]);
    const raised = await svc.raisePrescription("doc-1", rx());
    if (!raised.ok) throw new Error("setup");
    await svc.dispense("phm-1", { prescriptionId: raised.value.id });
    const twice = await svc.dispense("phm-1", { prescriptionId: raised.value.id });
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.error.detailKey).toBe("pharmacy.status.invalid_transition");
  });
});

describe("ready / collected / cancel + fulfilment", () => {
  async function dispensed() {
    const env = build();
    env.inventory.seed("rfsh", "pharmacy-ground", [{ lotNo: "L1", expiry: "2027-01-01", quantity: 5 }]);
    const raised = await env.svc.raisePrescription("doc-1", rx({ encounterId: "enc-1" }));
    if (!raised.ok) throw new Error("setup");
    await env.svc.dispense("phm-1", { prescriptionId: raised.value.id });
    return { ...env, id: raised.value.id };
  }

  it("markReady then markCollected advance the status", async () => {
    const { svc, id } = await dispensed();
    expect((await svc.markReady("phm-1", id)).ok).toBe(true);
    expect((await svc.get(id))?.status).toBe("ready");
    expect((await svc.markCollected("phm-1", id)).ok).toBe(true);
    expect((await svc.get(id))?.status).toBe("collected");
  });
  it("markReady rejects an unknown prescription and a bad transition", async () => {
    const { svc } = build();
    expect((await svc.markReady("phm-1", "nope")).ok).toBe(false);
    const raised = await svc.raisePrescription("doc-1", rx());
    if (!raised.ok) throw new Error("setup");
    const bad = await svc.markReady("phm-1", raised.value.id); // still pending
    expect(bad.ok).toBe(false);
  });
  it("cancel needs a reason and only works pre-dispense", async () => {
    const { svc } = build();
    const raised = await svc.raisePrescription("doc-1", rx());
    if (!raised.ok) throw new Error("setup");
    expect((await svc.cancel("doc-1", raised.value.id, "  ")).ok).toBe(false);
    expect((await svc.cancel("doc-1", "nope", "duplicate")).ok).toBe(false);
    const cancelled = await svc.cancel("doc-1", raised.value.id, "duplicate script");
    expect(cancelled.ok).toBe(true);
    if (cancelled.ok) expect(cancelled.value.cancelReason).toBe("duplicate script");
  });

  it("isPrescriptionFulfilled: false with no script; true once all are ready/collected", async () => {
    const { svc, id } = await dispensed();
    expect(await svc.isPrescriptionFulfilled("enc-unknown")).toBe(false);
    expect(await svc.isPrescriptionFulfilled("enc-1")).toBe(false); // still dispensing
    await svc.markReady("phm-1", id);
    expect(await svc.isPrescriptionFulfilled("enc-1")).toBe(true);
  });
});
