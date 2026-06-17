import { describe, expect, it } from "vitest";
import { fixedClock, asId } from "@oxford/core";
import { AuditLog, InMemoryChainStore, type AuditPayload } from "@oxford/audit";
import { InMemoryDeviceCatalogueStore, SEED_DEVICE_CATALOGUE, toImplantRecord } from "./device-registry.js";
import { InMemoryImplantUsageStore } from "./device-registry-store.js";
import { DeviceRegistryService } from "./device-registry-service.js";
import type { ConsumableUse } from "./types.js";

type UseOver = Partial<Omit<ConsumableUse, "id">> & { id?: string };
const use = (over: UseOver = {}): ConsumableUse => {
  const { id, ...rest } = over;
  return {
    id: asId<"ConsumableUse">(id ?? "cu-1"),
    encounterId: "enc-1",
    patientId: "pat-1",
    code: "surgical_mesh",
    description: "Surgical mesh",
    lotNo: "LOT-9",
    quantity: 1,
    unitPriceFils: 1000,
    invoiceRef: "inv-1",
    recordedBy: "surgeon-1",
    recordedAt: "2026-06-10T10:00:00.000Z",
    ...rest,
  };
};

function build(uses: readonly ConsumableUse[]) {
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), fixedClock(new Date("2026-06-17T08:00:00.000Z")));
  const svc = new DeviceRegistryService(new InMemoryDeviceCatalogueStore(), new InMemoryImplantUsageStore(uses), audit);
  return { svc, audit };
}

describe("device registry — catalogue config + enrichment (pure)", () => {
  it("seed catalogue is bilingual; toImplantRecord copies device metadata onto the line", () => {
    expect(SEED_DEVICE_CATALOGUE.every((e) => e.name.ar && e.name.en)).toBe(true);
    const entry = SEED_DEVICE_CATALOGUE.find((e) => e.code === "surgical_mesh")!;
    const rec = toImplantRecord(use({}), entry);
    expect(rec).toMatchObject({ patientId: "pat-1", deviceType: "mesh", lotNo: "LOT-9", implantedAt: "2026-06-10T10:00:00.000Z" });
  });
  it("catalogue store: get + active filter", async () => {
    const store = new InMemoryDeviceCatalogueStore([{ code: "x", name: { ar: "x", en: "x" }, deviceType: "t", manufacturer: "m", active: false }]);
    expect(await store.get("x")).not.toBeNull();
    expect(await store.listActive()).toEqual([]);
    expect(await store.get("missing")).toBeNull();
  });
});

describe("DeviceRegistryService", () => {
  it("reports only registrable implants for a patient (ignoring non-catalogue consumables)", async () => {
    const { svc } = build([use({ id: "cu-1", code: "surgical_mesh" }), use({ id: "cu-2", code: "gauze_swab" })]);
    const implants = await svc.implantsForPatient("pat-1");
    expect(implants).toHaveLength(1);
    expect(implants[0]!.code).toBe("surgical_mesh");
    expect((await svc.listDevices()).length).toBe(SEED_DEVICE_CATALOGUE.length);
  });

  it("recall lookup finds every recipient of a code/lot and audits the read", async () => {
    const { svc, audit } = build([
      use({ id: "cu-1", patientId: "pat-1", lotNo: "LOT-9" }),
      use({ id: "cu-2", patientId: "pat-2", lotNo: "LOT-9" }),
      use({ id: "cu-3", patientId: "pat-3", lotNo: "LOT-OTHER" }),
    ]);
    const recall = await svc.recallLookup("safety-officer", "surgical_mesh", "LOT-9");
    expect(recall.map((r) => r.patientId).sort()).toEqual(["pat-1", "pat-2"]);
    // without a lot → all lots of the code
    expect(await svc.recallLookup("safety-officer", "surgical_mesh")).toHaveLength(3);
    const entries = await audit.entries();
    expect(entries.filter((e) => e.payload.action === "READ_EXPORT")).toHaveLength(2);
  });

  it("registry export returns implants in the window and audits the export", async () => {
    const { svc, audit } = build([
      use({ id: "cu-1", recordedAt: "2026-05-01T00:00:00.000Z" }),
      use({ id: "cu-2", recordedAt: "2026-06-10T00:00:00.000Z" }),
    ]);
    const rows = await svc.registryExport("registrar", "2026-06-01T00:00:00.000Z", "2026-06-30T23:59:59.000Z");
    expect(rows.map((r) => r.consumableUseId)).toEqual([asId<"ConsumableUse">("cu-2")]);
    expect((await audit.entries()).some((e) => e.payload.entityType === "DeviceRegistryExport")).toBe(true);
  });
});
