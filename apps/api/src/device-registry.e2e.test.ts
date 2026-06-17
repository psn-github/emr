// P2 — IMPLANT/DEVICE REGISTRY REPORTING, end-to-end on real Postgres. Proves:
// the device catalogue is config; registrable implants are reported from the
// lot-traced consumable lines (patient record), recall lookup finds every
// recipient of a code/lot, and a periodic export is produced — recall + export
// audited, chain intact. Runs where DATABASE_URL is set (CI provides it).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedDeviceCatalogue, SEED_DEVICE_CATALOGUE } from "@oxford/perioperative";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("P2 implant/device registry (e2e, real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  const insertUse = (id: string, patientId: string, code: string, lotNo: string, recordedAt: string) =>
    pool.query(
      `INSERT INTO perioperative.consumable_use (id, encounter_id, patient_id, code, description, lot_no, quantity, unit_price_fils, invoice_ref, recorded_by, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,1,1000,'inv-1','surgeon-1',$7)`,
      [id, `enc-${patientId}`, patientId, code, code, lotNo, recordedAt],
    );

  beforeAll(async () => {
    await runMigrations(pool);
    await seedDeviceCatalogue(pool, SEED_DEVICE_CATALOGUE);
    services = buildServices(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE perioperative.consumable_use");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("reports patient implants, recall recipients, and a windowed export", async () => {
    expect((await services.deviceRegistry.listDevices()).map((d) => d.code)).toEqual(expect.arrayContaining(["surgical_mesh", "adhesion_barrier"]));

    await insertUse("cu-1", "pat-1", "surgical_mesh", "LOT-9", "2026-06-10T10:00:00.000Z");
    await insertUse("cu-2", "pat-2", "surgical_mesh", "LOT-9", "2026-06-11T10:00:00.000Z");
    await insertUse("cu-3", "pat-3", "surgical_mesh", "LOT-OTHER", "2026-05-01T10:00:00.000Z");
    await insertUse("cu-4", "pat-1", "gauze_swab", "LOT-G", "2026-06-10T10:05:00.000Z"); // not registrable

    // patient implant record — only the registrable device
    const implants = await services.deviceRegistry.implantsForPatient("pat-1");
    expect(implants.map((i) => i.code)).toEqual(["surgical_mesh"]);
    expect(implants[0]!.deviceType).toBe("mesh");

    // recall: every recipient of code + lot
    const recall = await services.deviceRegistry.recallLookup("safety-officer", "surgical_mesh", "LOT-9");
    expect(recall.map((r) => r.patientId).sort()).toEqual(["pat-1", "pat-2"]);

    // windowed export (June only) excludes the May implant and the non-registrable swab
    const exported = await services.deviceRegistry.registryExport("registrar", "2026-06-01T00:00:00.000Z", "2026-06-30T23:59:59.000Z");
    expect(exported.map((r) => r.consumableUseId).sort()).toEqual(["cu-1", "cu-2"]);

    const integrity = await services.audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });
});
