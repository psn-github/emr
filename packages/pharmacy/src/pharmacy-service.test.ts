import { describe, expect, it } from "vitest";
import { fixedClock, ok, err, preconditionFailed, type Result, type AppError } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { PharmacyService, type RaisePrescriptionInput } from "./pharmacy-service.js";
import { InMemoryPharmacyStore } from "./store.js";
import type { FormularyPort, AllergyPort, InventoryPort, ControlledRegisterPort, DrugInfo, ControlledIssueInput } from "./ports.js";
import type { StockAllocation } from "./types.js";

// Service tests over the in-memory store + fake ports (no I/O).

const NOW = new Date("2026-07-03T08:00:00.000Z");
const dose = { en: "225 IU daily", ar: "225 وحدة يومياً" };

// Prescription formulary — stim-only (the external-fulfilment prescription source).
class FakeFormulary implements FormularyPort {
  readonly drugs = new Map<string, DrugInfo>([
    ["rfsh", { nameEn: "Recombinant FSH", nameAr: "FSH", drugClass: "gonadotropin_fsh" }],
    ["prog", { nameEn: "Progesterone", nameAr: "بروجستيرون", drugClass: "progesterone", coldChain: true }],
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

// Theatre formulary — composite (anaesthesia + stim); carries a controlled and a
// cold-chain drug.
class FakeTheatreFormulary implements FormularyPort {
  readonly drugs = new Map<string, DrugInfo>([
    ["propofol", { nameEn: "Propofol", nameAr: "بروبوفول", drugClass: "anaesthetic" }],
    ["fentanyl", { nameEn: "Fentanyl", nameAr: "فنتانيل", drugClass: "anaesthetic", controlled: true }],
    ["cold_relaxant", { nameEn: "Cold Relaxant", nameAr: "مرخٍ", drugClass: "anaesthetic", coldChain: true }],
  ]);
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
  seed(drugId: string, location: string, lots: Lot[]): void {
    this.lots.set(`${drugId}@${location}`, lots.map((l) => ({ ...l })));
  }
  async availableAt(drugId: string, locationId: string): Promise<number> {
    return (this.lots.get(`${drugId}@${locationId}`) ?? []).reduce((s, l) => s + l.quantity, 0);
  }
  async issueFefo(_actorId: string, drugId: string, locationId: string, quantity: number): Promise<Result<readonly StockAllocation[], AppError>> {
    const lots = (this.lots.get(`${drugId}@${locationId}`) ?? []).slice().sort((a, b) => Date.parse(a.expiry) - Date.parse(b.expiry));
    const total = lots.reduce((s, l) => s + l.quantity, 0);
    if (quantity > total) return err(preconditionFailed("insufficient", "inventory.stock.insufficient"));
    const alloc: StockAllocation[] = [];
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
  const theatreFormulary = new FakeTheatreFormulary();
  const allergy = new FakeAllergy();
  const inventory = new FakeInventory();
  const controlled = new FakeControlled();
  const svc = new PharmacyService(store, formulary, theatreFormulary, allergy, inventory, controlled, audit, events, clock, { theatreStockLocationId: "theatre-l1" });
  return { svc, audit, events, store, formulary, theatreFormulary, allergy, inventory, controlled };
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
    expect(r.ok).toBe(false);
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
    expect(r.value.externalRef).toBeNull();
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
    expect((await svc.queue("issued")).length).toBe(0);
    expect((await svc.get(a.value.id))?.id).toBe(a.value.id);
    expect(await svc.get("nope")).toBeNull();
  });
});

describe("prescription lifecycle: issue → external fulfilment (NO stock movement)", () => {
  it("issues a pending prescription, then records external fulfilment (with ref + note)", async () => {
    const { svc, inventory, controlled, events } = build();
    const raised = await svc.raisePrescription("doc-1", rx({ encounterId: "enc-1" }));
    if (!raised.ok) throw new Error("setup");

    const issued = await svc.issuePrescription("doc-1", raised.value.id);
    expect(issued.ok).toBe(true);
    if (issued.ok) expect(issued.value.status).toBe("issued");

    const fulfilled = await svc.recordExternalFulfilment("rec-1", { prescriptionId: raised.value.id, externalRef: " GRD-99 ", note: " handed over " });
    expect(fulfilled.ok).toBe(true);
    if (fulfilled.ok) {
      expect(fulfilled.value.status).toBe("fulfilled");
      expect(fulfilled.value.externalRef).toBe("GRD-99"); // trimmed
      expect(fulfilled.value.fulfilmentNote).toBe("handed over");
    }
    // The external-fulfilment path performs ZERO inventory + controlled-register writes.
    expect(inventory.lots.size).toBe(0);
    expect(controlled.posted).toEqual([]);
    expect((await events.events()).some((e) => e.payload.type === "PrescriptionIssued")).toBe(true);
    expect((await events.events()).some((e) => e.payload.type === "PrescriptionFulfilled")).toBe(true);
  });

  it("external fulfilment defaults ref + note to null when blank", async () => {
    const { svc } = build();
    const raised = await svc.raisePrescription("doc-1", rx());
    if (!raised.ok) throw new Error("setup");
    await svc.issuePrescription("doc-1", raised.value.id);
    const fulfilled = await svc.recordExternalFulfilment("rec-1", { prescriptionId: raised.value.id, externalRef: "  ", note: "" });
    expect(fulfilled.ok).toBe(true);
    if (fulfilled.ok) {
      expect(fulfilled.value.externalRef).toBeNull();
      expect(fulfilled.value.fulfilmentNote).toBeNull();
    }
  });

  it("cannot fulfil a prescription that was never issued (must issue first)", async () => {
    const { svc } = build();
    const raised = await svc.raisePrescription("doc-1", rx());
    if (!raised.ok) throw new Error("setup");
    const r = await svc.recordExternalFulfilment("rec-1", { prescriptionId: raised.value.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("pharmacy.status.invalid_transition");
  });

  it("rejects issuing/fulfilling an unknown prescription", async () => {
    const { svc } = build();
    expect((await svc.issuePrescription("doc-1", "nope")).ok).toBe(false);
    expect((await svc.recordExternalFulfilment("rec-1", { prescriptionId: "nope" })).ok).toBe(false);
  });

  it("issue rejects a non-pending prescription", async () => {
    const { svc } = build();
    const raised = await svc.raisePrescription("doc-1", rx());
    if (!raised.ok) throw new Error("setup");
    await svc.issuePrescription("doc-1", raised.value.id);
    const twice = await svc.issuePrescription("doc-1", raised.value.id);
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.error.detailKey).toBe("pharmacy.status.invalid_transition");
  });
});

describe("cancel + fulfilment gate", () => {
  it("cancel needs a reason and works pre-fulfilment (pending or issued)", async () => {
    const { svc } = build();
    const a = await svc.raisePrescription("doc-1", rx());
    const b = await svc.raisePrescription("doc-1", rx({ patientId: "pat-2" }));
    if (!a.ok || !b.ok) throw new Error("setup");
    expect((await svc.cancel("doc-1", a.value.id, "  ")).ok).toBe(false);
    expect((await svc.cancel("doc-1", "nope", "duplicate")).ok).toBe(false);
    // pending → cancelled
    const c1 = await svc.cancel("doc-1", a.value.id, "duplicate script");
    expect(c1.ok).toBe(true);
    if (c1.ok) expect(c1.value.cancelReason).toBe("duplicate script");
    // issued → cancelled
    await svc.issuePrescription("doc-1", b.value.id);
    expect((await svc.cancel("doc-1", b.value.id, "changed plan")).ok).toBe(true);
  });

  it("cannot cancel a fulfilled prescription", async () => {
    const { svc } = build();
    const raised = await svc.raisePrescription("doc-1", rx());
    if (!raised.ok) throw new Error("setup");
    await svc.issuePrescription("doc-1", raised.value.id);
    await svc.recordExternalFulfilment("rec-1", { prescriptionId: raised.value.id });
    const r = await svc.cancel("doc-1", raised.value.id, "too late");
    expect(r.ok).toBe(false);
  });

  it("isPrescriptionFulfilled: false with no script; true only once ALL are fulfilled", async () => {
    const { svc } = build();
    const raised = await svc.raisePrescription("doc-1", rx({ encounterId: "enc-1" }));
    if (!raised.ok) throw new Error("setup");
    expect(await svc.isPrescriptionFulfilled("enc-unknown")).toBe(false);
    expect(await svc.isPrescriptionFulfilled("enc-1")).toBe(false); // pending
    await svc.issuePrescription("doc-1", raised.value.id);
    expect(await svc.isPrescriptionFulfilled("enc-1")).toBe(false); // issued, not yet fulfilled
    await svc.recordExternalFulfilment("rec-1", { prescriptionId: raised.value.id });
    expect(await svc.isPrescriptionFulfilled("enc-1")).toBe(true);
  });
});

describe("administerTheatreDrugs (in-house stock)", () => {
  it("rejects a non-formulary drug (composite formulary)", async () => {
    const { svc } = build();
    const r = await svc.administerTheatreDrugs("anae-1", { encounterId: "enc-1", patientId: "pat-1", drugs: [{ drugId: "aspirin", quantity: 1 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("pharmacy.admin.not_in_formulary");
  });
  it("rejects a drug that is prescribable but has no drug info (defensive)", async () => {
    const { svc, theatreFormulary } = build();
    theatreFormulary.hideInfo = true;
    const r = await svc.administerTheatreDrugs("anae-1", { encounterId: "enc-1", patientId: "pat-1", drugs: [{ drugId: "ghost", quantity: 1 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("pharmacy.admin.not_in_formulary");
  });
  it("rejects an empty administration before the formulary", async () => {
    const { svc } = build();
    const r = await svc.administerTheatreDrugs("anae-1", { encounterId: "enc-1", patientId: "pat-1", drugs: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("pharmacy.admin.empty");
  });

  it("FEFO-decrements theatre stock, records allocations, persists the administration", async () => {
    const { svc, inventory, store } = build();
    inventory.seed("propofol", "theatre-l1", [
      { lotNo: "L-late", expiry: "2028-01-01", quantity: 5 },
      { lotNo: "L-early", expiry: "2027-01-01", quantity: 1 },
    ]);
    const r = await svc.administerTheatreDrugs("anae-1", { encounterId: "enc-1", patientId: "pat-1", drugs: [{ drugId: "propofol", quantity: 2 }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.allocations).toEqual([
      { drugId: "propofol", lotNo: "L-early", expiry: "2027-01-01", quantity: 1 },
      { drugId: "propofol", lotNo: "L-late", expiry: "2028-01-01", quantity: 1 },
    ]);
    expect(await inventory.availableAt("propofol", "theatre-l1")).toBe(4);
    const persisted = await store.theatreAdministrationsForEncounter("enc-1");
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.items[0]).toMatchObject({ drugId: "propofol", quantity: 2, drugClass: "anaesthetic" });
  });

  it("insufficient stock leaves NO partial decrement (typed error)", async () => {
    const { svc, inventory } = build();
    inventory.seed("propofol", "theatre-l1", [{ lotNo: "L1", expiry: "2027-01-01", quantity: 1 }]);
    const r = await svc.administerTheatreDrugs("anae-1", { encounterId: "enc-1", patientId: "pat-1", drugs: [{ drugId: "propofol", quantity: 5 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("pharmacy.admin.insufficient_stock");
    expect(await inventory.availableAt("propofol", "theatre-l1")).toBe(1); // untouched
  });

  it("a controlled drug REQUIRES a witness and posts a witnessed register movement", async () => {
    const { svc, inventory, controlled } = build();
    inventory.seed("fentanyl", "theatre-l1", [{ lotNo: "CD-1", expiry: "2027-01-01", quantity: 3 }]);
    const noWitness = await svc.administerTheatreDrugs("anae-1", { encounterId: "enc-1", patientId: "pat-1", drugs: [{ drugId: "fentanyl", quantity: 2 }] });
    expect(noWitness.ok).toBe(false);
    if (!noWitness.ok) expect(noWitness.error.detailKey).toBe("pharmacy.admin.witness_required");
    const d = await svc.administerTheatreDrugs("anae-1", { encounterId: "enc-1", patientId: "pat-1", drugs: [{ drugId: "fentanyl", quantity: 2 }], witnessStaffId: "nurse-2" });
    expect(d.ok).toBe(true);
    expect(controlled.posted).toEqual([{ drugId: "fentanyl", lotNo: "CD-1", quantity: 2, patientRef: "pat-1", witnessStaffId: "nurse-2", occurredAt: NOW.toISOString() }]);
  });

  it("surfaces a controlled-register failure as a domain error", async () => {
    const { svc, inventory, controlled } = build();
    controlled.fail = true;
    inventory.seed("fentanyl", "theatre-l1", [{ lotNo: "CD-1", expiry: "2027-01-01", quantity: 3 }]);
    const d = await svc.administerTheatreDrugs("anae-1", { encounterId: "enc-1", patientId: "pat-1", drugs: [{ drugId: "fentanyl", quantity: 1 }], witnessStaffId: "nurse-2" });
    expect(d.ok).toBe(false);
  });

  it("a cold-chain drug requires the cold-chain-handled assertion", async () => {
    const { svc, inventory } = build();
    inventory.seed("cold_relaxant", "theatre-l1", [{ lotNo: "CR-1", expiry: "2027-01-01", quantity: 5 }]);
    const rejected = await svc.administerTheatreDrugs("anae-1", { encounterId: "enc-1", patientId: "pat-1", drugs: [{ drugId: "cold_relaxant", quantity: 1 }] });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error.detailKey).toBe("pharmacy.admin.cold_chain_required");
    const okAdmin = await svc.administerTheatreDrugs("anae-1", { encounterId: "enc-1", patientId: "pat-1", drugs: [{ drugId: "cold_relaxant", quantity: 1 }], coldChainHandled: true });
    expect(okAdmin.ok).toBe(true);
  });

  it("surfaces a FEFO issue error from the inventory seam", async () => {
    const { svc } = build();
    // no stock seeded → availableAt is 0 → sufficiency fails first
    const r = await svc.administerTheatreDrugs("anae-1", { encounterId: "enc-1", patientId: "pat-1", drugs: [{ drugId: "propofol", quantity: 1 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("pharmacy.admin.insufficient_stock");
  });

  it("honours an explicit locationId and administeredAt", async () => {
    const { svc, inventory, store } = build();
    inventory.seed("propofol", "stores-a", [{ lotNo: "S1", expiry: "2027-01-01", quantity: 5 }]);
    const r = await svc.administerTheatreDrugs("anae-1", { encounterId: "enc-2", patientId: "pat-1", drugs: [{ drugId: "propofol", quantity: 1 }], locationId: "stores-a", administeredAt: "2026-06-01T00:00:00.000Z" });
    expect(r.ok).toBe(true);
    const persisted = await store.theatreAdministrationsForEncounter("enc-2");
    expect(persisted[0]!.locationId).toBe("stores-a");
    expect(persisted[0]!.administeredAt).toBe("2026-06-01T00:00:00.000Z");
  });
});
