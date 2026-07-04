// Integration: prescriptions + theatre-drug administrations persist to Postgres and
// round-trip exactly (jsonb items/allocations/warnings), the queue orders oldest-
// first, the external-fulfilment lifecycle holds, and the encounter-fulfilment read
// is true only once all linked scripts are fulfilled. Runs where DATABASE_URL is set.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { fixedClock, ok, err, preconditionFailed, type Result, type AppError } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { PharmacyService } from "./pharmacy-service.js";
import { PgPharmacyStore } from "./pg-store.js";
import type { FormularyPort, AllergyPort, InventoryPort, ControlledRegisterPort, DrugInfo, ControlledIssueInput } from "./ports.js";
import type { StockAllocation } from "./types.js";

const DATABASE_URL = process.env.DATABASE_URL;
const migration0001 = readFileSync(new URL("../migrations/0001_pharmacy.sql", import.meta.url), "utf8");
const migration0002 = readFileSync(new URL("../migrations/0002_pharmacy_theatre.sql", import.meta.url), "utf8");

class Formulary implements FormularyPort {
  private readonly drugs = new Map<string, DrugInfo>([
    ["rfsh", { nameEn: "Recombinant FSH", nameAr: "FSH", drugClass: "gonadotropin_fsh" }],
  ]);
  async isPrescribable(id: string): Promise<boolean> {
    return this.drugs.has(id);
  }
  async drugInfo(id: string): Promise<DrugInfo | null> {
    return this.drugs.get(id) ?? null;
  }
}
class TheatreFormulary implements FormularyPort {
  private readonly drugs = new Map<string, DrugInfo>([
    ["propofol", { nameEn: "Propofol", nameAr: "بروبوفول", drugClass: "anaesthetic" }],
    ["fentanyl", { nameEn: "Fentanyl", nameAr: "فنتانيل", drugClass: "anaesthetic", controlled: true }],
  ]);
  async isPrescribable(id: string): Promise<boolean> {
    return this.drugs.has(id);
  }
  async drugInfo(id: string): Promise<DrugInfo | null> {
    return this.drugs.get(id) ?? null;
  }
}
class NoAllergies implements AllergyPort {
  async allergicClasses(): Promise<readonly string[]> {
    return [];
  }
}
class OneLotInventory implements InventoryPort {
  private readonly stock = new Map<string, number>();
  seed(drugId: string, qty: number): void {
    this.stock.set(drugId, qty);
  }
  async availableAt(drugId: string): Promise<number> {
    return this.stock.get(drugId) ?? 0;
  }
  async issueFefo(_a: string, drugId: string, _loc: string, quantity: number): Promise<Result<readonly StockAllocation[], AppError>> {
    const have = this.stock.get(drugId) ?? 0;
    if (quantity > have) return err(preconditionFailed("insufficient", "inventory.stock.insufficient"));
    this.stock.set(drugId, have - quantity);
    return ok([{ drugId, lotNo: "LOT-A", expiry: "2027-12-01", quantity }]);
  }
}
class Register implements ControlledRegisterPort {
  readonly posted: ControlledIssueInput[] = [];
  async postIssue(_a: string, input: ControlledIssueInput): Promise<Result<void, AppError>> {
    this.posted.push(input);
    return ok(undefined);
  }
}

describe.skipIf(!DATABASE_URL)("PgPharmacyStore", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const clock = fixedClock(new Date("2026-07-03T08:00:00.000Z"));

  function svcWith() {
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
    const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
    const store = new PgPharmacyStore(pool);
    const inventory = new OneLotInventory();
    const register = new Register();
    const svc = new PharmacyService(store, new Formulary(), new TheatreFormulary(), new NoAllergies(), inventory, register, audit, events, clock, { theatreStockLocationId: "theatre-l1" });
    return { svc, store, inventory, register };
  }

  beforeAll(async () => {
    await pool.query(migration0001);
    await pool.query(migration0002);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE pharmacy.prescription, pharmacy.theatre_drug_administration");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("persists the external-fulfilment lifecycle and round-trips jsonb exactly", async () => {
    const { svc, store } = svcWith();
    const raised = await svc.raisePrescription("doc-1", { patientId: "pat-1", encounterId: "enc-1", items: [{ drugId: "rfsh", quantity: 2, doseInstruction: { en: "225 IU", ar: "225 وحدة" } }] });
    if (!raised.ok) throw new Error("setup");

    await svc.issuePrescription("doc-1", raised.value.id);
    const persistedIssued = await store.getPrescription(raised.value.id);
    expect(persistedIssued).toMatchObject({ status: "issued", encounterId: "enc-1" });
    expect(persistedIssued!.items[0]).toMatchObject({ drugId: "rfsh", quantity: 2, drugClass: "gonadotropin_fsh" });

    await svc.recordExternalFulfilment("rec-1", { prescriptionId: raised.value.id, externalRef: "GRD-7", note: "handed over" });
    const persisted = await store.getPrescription(raised.value.id);
    expect(persisted).toMatchObject({ status: "fulfilled", externalRef: "GRD-7", fulfilmentNote: "handed over" });
    expect(await svc.isPrescriptionFulfilled("enc-1")).toBe(true);
  });

  it("queues oldest-first and filters by status", async () => {
    const { svc } = svcWith();
    const a = await svc.raisePrescription("doc-1", { patientId: "p-a", items: [{ drugId: "rfsh", quantity: 1, doseInstruction: { en: "x", ar: "س" } }] });
    const b = await svc.raisePrescription("doc-1", { patientId: "p-b", items: [{ drugId: "rfsh", quantity: 1, doseInstruction: { en: "x", ar: "س" } }] });
    if (!a.ok || !b.ok) throw new Error("setup");
    expect((await svc.queue()).map((p) => p.patientId)).toEqual(["p-a", "p-b"]);
    await svc.issuePrescription("doc-1", a.value.id);
    expect((await svc.queue("pending")).map((p) => p.patientId)).toEqual(["p-b"]);
    expect((await svc.queue("issued")).map((p) => p.patientId)).toEqual(["p-a"]);
  });

  it("persists a theatre administration and posts a witnessed controlled movement", async () => {
    const { svc, store, inventory, register } = svcWith();
    inventory.seed("fentanyl", 5);
    const d = await svc.administerTheatreDrugs("anae-1", { encounterId: "enc-op", patientId: "pat-9", drugs: [{ drugId: "fentanyl", quantity: 2 }], witnessStaffId: "nurse-2" });
    expect(d.ok).toBe(true);
    const persisted = await store.theatreAdministrationsForEncounter("enc-op");
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.allocations).toEqual([{ drugId: "fentanyl", lotNo: "LOT-A", expiry: "2027-12-01", quantity: 2 }]);
    expect(persisted[0]!.witnessStaffId).toBe("nurse-2");
    expect(register.posted).toEqual([{ drugId: "fentanyl", lotNo: "LOT-A", quantity: 2, patientRef: "pat-9", witnessStaffId: "nurse-2", occurredAt: "2026-07-03T08:00:00.000Z" }]);
  });
});
