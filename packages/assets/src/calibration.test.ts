import { describe, expect, it } from "vitest";
import { fixedClock, asId } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { calibrationStatus, isDueWithin, assetUsability, validateMaintenanceDates, validateDowntime } from "./calibration.js";
import { AssetService } from "./asset-service.js";
import { InMemoryAssetStore, latestNextDue } from "./store.js";
import type { Asset, MaintenanceRecord } from "./types.js";

const ASOF = new Date("2026-06-20T00:00:00Z");

describe("calibration logic (pure)", () => {
  it("derives calibration status from the next-due date", () => {
    expect(calibrationStatus(null, ASOF)).toBe("none");
    expect(calibrationStatus("2026-07-01T00:00:00Z", ASOF)).toBe("ok");
    expect(calibrationStatus("2026-06-19T00:00:00Z", ASOF)).toBe("overdue");
  });
  it("flags due-soon only when current and within the window", () => {
    expect(isDueWithin(null, ASOF, 30)).toBe(false);
    expect(isDueWithin("2026-06-25T00:00:00Z", ASOF, 30)).toBe(true); // 5 days out
    expect(isDueWithin("2026-08-01T00:00:00Z", ASOF, 30)).toBe(false); // beyond window
    expect(isDueWithin("2026-06-01T00:00:00Z", ASOF, 30)).toBe(false); // already overdue
  });
  it("blocks a critical asset unless calibration is OK; never blocks non-critical", () => {
    expect(assetUsability(true, "ok")).toEqual({ usable: true });
    expect(assetUsability(true, "overdue")).toEqual({ usable: false, reason: "calibration_overdue" });
    expect(assetUsability(true, "none")).toEqual({ usable: false, reason: "calibration_missing" });
    expect(assetUsability(false, "overdue")).toEqual({ usable: true });
    expect(assetUsability(false, "none")).toEqual({ usable: true });
  });
  it("validates maintenance dates and downtime", () => {
    expect(validateMaintenanceDates("2026-06-20T00:00:00Z", "2026-12-20T00:00:00Z").ok).toBe(true);
    expect(validateMaintenanceDates("2026-06-20T00:00:00Z", null).ok).toBe(true);
    expect(detail(validateMaintenanceDates("2026-06-20T00:00:00Z", "2026-06-20T00:00:00Z"))).toBe("assets.maintenance.due_before_performed");
    expect(validateDowntime(0).ok).toBe(true);
    expect(detail(validateDowntime(-1))).toBe("assets.fault.downtime_invalid");
    expect(detail(validateDowntime(1.5))).toBe("assets.fault.downtime_invalid");
  });
  it("latestNextDue picks the most recent record of the type (order-independent)", () => {
    const recs: MaintenanceRecord[] = [
      maint("calibration", "2026-02-01T00:00:00Z", "2026-08-01T00:00:00Z"), // mid
      maint("calibration", "2026-03-01T00:00:00Z", "2026-09-01T00:00:00Z"), // latest (reduce keeps r)
      maint("calibration", "2026-01-01T00:00:00Z", "2026-07-01T00:00:00Z"), // earliest (reduce keeps latest)
      maint("ppm", "2026-05-01T00:00:00Z", "2026-11-01T00:00:00Z"),
    ];
    expect(latestNextDue(recs, "calibration")).toBe("2026-09-01T00:00:00Z");
    expect(latestNextDue(recs, "service")).toBeNull();
  });
});

describe("InMemoryAssetStore", () => {
  it("upserts an asset by id (no duplicate on re-save)", async () => {
    const store = new InMemoryAssetStore();
    const a: Asset = { id: asId<"Asset">("a1"), name: "X", category: "other", locationId: "l", serialNumber: "S", supplierId: null, warrantyExpiry: null, critical: false, status: "active" };
    await store.saveAsset(a);
    await store.saveAsset({ ...a, name: "X2", status: "retired" });
    const all = await store.assets();
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe("X2");
    expect(await store.getFault("nope" as never)).toBeUndefined();
  });
});

function build() {
  const clock = fixedClock(ASOF);
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  return { svc: new AssetService(new InMemoryAssetStore(), audit, events) };
}

describe("AssetService — register, calibrate, gate, alerts, faults", () => {
  it("blocks a critical asset with overdue/missing calibration and clears it once calibrated", async () => {
    const { svc } = build();
    const inc = await svc.registerAsset("eng-1", { name: "Incubator A", category: "incubator", locationId: "lab", serialNumber: "INC-1", critical: true });
    // no calibration yet → missing → blocked
    expect((await svc.assertUsable(inc.id, ASOF)).ok).toBe(false);
    let status = await svc.assetStatus(inc.id, ASOF);
    expect(status.ok && status.value.calibration).toBe("none");

    // an overdue calibration → still blocked
    await svc.recordMaintenance("eng-1", { assetId: inc.id, type: "calibration", performedAt: "2025-12-01T00:00:00Z", nextDueDate: "2026-06-01T00:00:00Z" });
    expect((await svc.assertUsable(inc.id, ASOF)).ok).toBe(false);

    // an ad-hoc service visit with notes and no next-due date is accepted
    const svcVisit = await svc.recordMaintenance("eng-1", { assetId: inc.id, type: "service", performedAt: "2026-06-10T00:00:00Z", notes: "replaced HEPA filter" });
    expect(svcVisit.ok && svcVisit.value.nextDueDate).toBeNull();
    expect(svcVisit.ok && svcVisit.value.notes).toBe("replaced HEPA filter");

    // a current calibration → usable
    await svc.recordMaintenance("eng-1", { assetId: inc.id, type: "calibration", performedAt: "2026-06-15T00:00:00Z", nextDueDate: "2026-12-15T00:00:00Z" });
    expect((await svc.assertUsable(inc.id, ASOF)).ok).toBe(true);
    status = await svc.assetStatus(inc.id, ASOF);
    expect(status.ok && status.value.usability.usable).toBe(true);
  });

  it("non-critical overdue is alert-only (usable); sorts the fleet into blocking/non-blocking/due-soon", async () => {
    const { svc } = build();
    const critical = await svc.registerAsset("eng-1", { name: "Incubator B", category: "incubator", locationId: "lab", serialNumber: "INC-2", critical: true });
    const minor = await svc.registerAsset("eng-1", { name: "Office printer", category: "other", locationId: "office", serialNumber: "PR-1", critical: false });
    const soon = await svc.registerAsset("eng-1", { name: "Scanner", category: "scanner", locationId: "l3", serialNumber: "SC-1", critical: true });
    await svc.recordMaintenance("eng-1", { assetId: critical.id, type: "calibration", performedAt: "2025-12-01T00:00:00Z", nextDueDate: "2026-06-01T00:00:00Z" }); // overdue
    await svc.recordMaintenance("eng-1", { assetId: minor.id, type: "calibration", performedAt: "2025-12-01T00:00:00Z", nextDueDate: "2026-06-01T00:00:00Z" }); // overdue, non-critical
    await svc.recordMaintenance("eng-1", { assetId: soon.id, type: "calibration", performedAt: "2026-06-01T00:00:00Z", nextDueDate: "2026-06-25T00:00:00Z" }); // due soon

    expect((await svc.assertUsable(minor.id, ASOF)).ok).toBe(true); // non-critical never blocked
    const alerts = await svc.alerts(ASOF, 30);
    expect(alerts.blocking.map((a) => a.assetId)).toEqual([critical.id]);
    expect(alerts.nonBlocking.map((a) => a.assetId)).toEqual([minor.id]);
    expect(alerts.dueSoon.map((a) => a.assetId)).toEqual([soon.id]);
  });

  it("logs faults with downtime and guards the lifecycle", async () => {
    const { svc } = build();
    const a = await svc.registerAsset("eng-1", { name: "Laser", category: "laser", locationId: "l1", serialNumber: "LZ-1", critical: false });
    const f = await svc.reportFault("eng-1", { assetId: a.id, reportedAt: "2026-06-18T00:00:00Z", description: "won't power on", severity: "major" });
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    // an invalid downtime on an unresolved fault is rejected by the service
    expect(detail(await svc.resolveFault("eng-1", f.value.id, "2026-06-19T00:00:00Z", -5))).toBe("assets.fault.downtime_invalid");
    const resolved = await svc.resolveFault("eng-1", f.value.id, "2026-06-19T00:00:00Z", 600);
    expect(resolved.ok && resolved.value.downtimeMinutes).toBe(600);
    // double-resolve blocked
    expect(detail(await svc.resolveFault("eng-1", f.value.id, "2026-06-20T00:00:00Z", 1))).toBe("assets.fault.already_resolved");
    expect((await svc.faults(a.id))).toHaveLength(1);
  });

  it("surfaces not-found and validation errors", async () => {
    const { svc } = build();
    expect(detail(await svc.recordMaintenance("eng-1", { assetId: "ghost", type: "calibration", performedAt: "2026-06-20T00:00:00Z" }))).toBe("assets.asset.not_found");
    expect(detail(await svc.reportFault("eng-1", { assetId: "ghost", reportedAt: "2026-06-20T00:00:00Z", description: "x", severity: "minor" }))).toBe("assets.asset.not_found");
    expect(detail(await svc.resolveFault("eng-1", "ghost" as never, "2026-06-20T00:00:00Z", 1))).toBe("assets.fault.not_found");
    expect(detail(await svc.assertUsable("ghost", ASOF))).toBe("assets.asset.not_found");
    const a = await svc.registerAsset("eng-1", { name: "X", category: "other", locationId: "l", serialNumber: "S", critical: false, supplierId: "sup-1", warrantyExpiry: "2027-01-01" });
    expect(detail(await svc.recordMaintenance("eng-1", { assetId: a.id, type: "calibration", performedAt: "2026-06-20T00:00:00Z", nextDueDate: "2026-06-19T00:00:00Z" }))).toBe("assets.maintenance.due_before_performed");
    expect((await svc.list())).toHaveLength(1);
    expect((await svc.maintenance(a.id))).toHaveLength(0);
  });
});

function maint(type: MaintenanceRecord["type"], performedAt: string, nextDueDate: string | null): MaintenanceRecord {
  return { id: "m" as MaintenanceRecord["id"], assetId: "a1", type, performedAt, performedBy: "eng-1", nextDueDate, notes: "" };
}
function detail(r: { ok: boolean; error?: { detailKey?: string } }): string | undefined {
  return r.ok ? undefined : r.error?.detailKey;
}
