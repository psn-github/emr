import { describe, expect, it } from "vitest";
import { fixedClock, ok, err, conflict, type Result, type AppError } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { validateDrugAdministration } from "./anaesthesia.js";
import { validateConsumableUse, lineTotalFils } from "./consumables.js";
import { IntraOpService } from "./intraop-service.js";
import { InMemoryIntraOpStore } from "./intraop-store.js";
import type { InventoryPort, PerioperativeBillingPort, InventoryDeductItem, ConsumableChargeLine } from "./ports.js";

describe("anaesthesia drug validation (pure)", () => {
  it("accepts a formulary drug with a positive dose + matching unit", () => {
    expect(validateDrugAdministration({ formularyCode: "propofol", dose: 200, unit: "mg" }).ok).toBe(true);
  });
  it("rejects free-text drugs, bad doses, and unit mismatches", () => {
    const nf = validateDrugAdministration({ formularyCode: "whisky", dose: 1, unit: "mg" });
    expect(nf.ok).toBe(false);
    if (!nf.ok) expect(nf.error.detailKey).toBe("perioperative.anaesthesia.not_in_formulary");
    const dose = validateDrugAdministration({ formularyCode: "propofol", dose: 0, unit: "mg" });
    expect(dose.ok).toBe(false);
    if (!dose.ok) expect(dose.error.detailKey).toBe("perioperative.anaesthesia.bad_dose");
    const unit = validateDrugAdministration({ formularyCode: "propofol", dose: 200, unit: "mcg" });
    expect(unit.ok).toBe(false);
    if (!unit.ok) expect(unit.error.detailKey).toBe("perioperative.anaesthesia.unit_mismatch");
  });
});

describe("consumable validation + line total (pure)", () => {
  it("validates quantity, price, and lot; computes integer line totals", () => {
    const good = { code: "mesh", description: "Mesh", lotNo: "L1", quantity: 2, unitPriceFils: 5000 };
    expect(validateConsumableUse(good).ok).toBe(true);
    expect(lineTotalFils(good)).toBe(10000);
    expect(validateConsumableUse({ ...good, quantity: 0 }).ok).toBe(false);
    expect(validateConsumableUse({ ...good, unitPriceFils: -1 }).ok).toBe(false);
    const lot = validateConsumableUse({ ...good, lotNo: " " });
    expect(lot.ok).toBe(false);
    if (!lot.ok) expect(lot.error.detailKey).toBe("perioperative.consumable.lot_required");
  });
});

class FakeInventory implements InventoryPort {
  ok = true;
  readonly deducted: InventoryDeductItem[][] = [];
  async deduct(_a: string, items: readonly InventoryDeductItem[]): Promise<Result<void, AppError>> {
    if (!this.ok) return err(conflict("insufficient stock", "inventory.insufficient"));
    this.deducted.push([...items]);
    return ok(undefined);
  }
}
class FakeBilling implements PerioperativeBillingPort {
  readonly charges: ConsumableChargeLine[][] = [];
  async raiseConsumableCharges(_a: string, _p: string, lines: readonly ConsumableChargeLine[]): Promise<string> {
    this.charges.push([...lines]);
    return "inv-1";
  }
}

function build() {
  const clock = fixedClock(new Date("2026-06-22T09:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const inventory = new FakeInventory();
  const billing = new FakeBilling();
  return { svc: new IntraOpService(new InMemoryIntraOpStore(), inventory, billing, audit, events), inventory, billing };
}

const intraOp = { encounterId: "enc-1", procedurePerformed: "hysteroscopy", findings: "normal", anaestheticTechnique: "GA", drugs: [{ formularyCode: "propofol", dose: 200, unit: "mg" as const }], staff: ["surgeon-1"], startedAt: "2026-06-22T09:00:00Z", finishedAt: "2026-06-22T09:45:00Z" };

describe("IntraOpService", () => {
  it("records an intra-op note with formulary drugs; rejects a non-formulary drug", async () => {
    const { svc } = build();
    expect((await svc.recordIntraOp("anaes-1", intraOp)).ok).toBe(true);
    expect((await svc.intraOp("enc-1"))!.procedurePerformed).toBe("hysteroscopy");
    const bad = await svc.recordIntraOp("anaes-1", { ...intraOp, drugs: [{ formularyCode: "whisky", dose: 1, unit: "mg" }] });
    expect(bad.ok).toBe(false);
  });

  it("captures consumables → deducts stock + bills + stores lot-traced records", async () => {
    const { svc, inventory, billing } = build();
    const uses = [
      { code: "mesh", description: "Hernia mesh", lotNo: "LOT-A", quantity: 1, unitPriceFils: 50000 },
      { code: "suture", description: "Suture", lotNo: "LOT-B", quantity: 3, unitPriceFils: 2000 },
    ];
    const r = await svc.recordConsumables("scrub-1", "enc-1", "pat-1", uses, "2026-06-22T09:30:00Z");
    expect(r.ok && r.value.invoiceRef).toBe("inv-1");
    expect(inventory.deducted[0]).toHaveLength(2);
    expect(billing.charges[0]).toHaveLength(2);
    const stored = await svc.consumables("enc-1");
    expect(stored).toHaveLength(2);
    expect(stored[0]!.lotNo).toBe("LOT-A");
  });

  it("rejects an invalid consumable before deducting/billing, and propagates a stock failure", async () => {
    const { svc, inventory, billing } = build();
    const invalid = await svc.recordConsumables("scrub-1", "enc-1", "pat-1", [{ code: "x", description: "x", lotNo: "", quantity: 1, unitPriceFils: 1 }], "z");
    expect(invalid.ok).toBe(false);
    expect(inventory.deducted).toHaveLength(0);
    expect(billing.charges).toHaveLength(0);

    inventory.ok = false;
    const noStock = await svc.recordConsumables("scrub-1", "enc-1", "pat-1", [{ code: "mesh", description: "Mesh", lotNo: "L", quantity: 1, unitPriceFils: 1 }], "z");
    expect(noStock.ok).toBe(false);
    if (!noStock.ok) expect(noStock.error.detailKey).toBe("inventory.insufficient");
    expect(billing.charges).toHaveLength(0); // never billed when stock fails
  });

  it("captures a specimen with its lot for traceability", async () => {
    const { svc } = build();
    const s = await svc.recordSpecimen("scrub-1", { encounterId: "enc-1", type: "endometrium", site: "uterus", lotRef: "SPEC-1", collectedAt: "2026-06-22T09:20:00Z" });
    expect(s.lotRef).toBe("SPEC-1");
    expect(await svc.specimens("enc-1")).toHaveLength(1);
  });
});
