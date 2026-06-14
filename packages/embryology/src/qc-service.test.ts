import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { LabQcService } from "./qc-service.js";
import { InMemoryQcParameterStore } from "./qc.js";
import { InMemoryQcReadingStore } from "./qc-store.js";

function build() {
  const clock = fixedClock(new Date("2026-06-14T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const svc = new LabQcService(new InMemoryQcParameterStore(), new InMemoryQcReadingStore(), audit, events);
  return { svc, events };
}

describe("LabQcService", () => {
  it("records an in-range reading as pass (with unit applied from config)", async () => {
    const { svc } = build();
    const r = await svc.record("lab-1", { parameterCode: "incubator_temp", value: 37.0, assetRef: "incubator-A", recordedBy: "lab-1", recordedAt: "2026-06-14T08:00:00.000Z" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.status).toBe("pass");
      expect(r.value.unit).toBe("°C");
      expect(r.value.assetRef).toBe("incubator-A");
      expect(r.value.lotNo).toBe(null);
    }
  });

  it("flags an out-of-range reading as fail and emits a breach event", async () => {
    const { svc, events } = build();
    const r = await svc.record("lab-1", { parameterCode: "media_ph", value: 6.9, lotNo: "LOT-77", recordedBy: "lab-1", recordedAt: "2026-06-14T09:00:00.000Z", note: "fresh bottle" });
    expect(r.ok && r.value.status).toBe("fail");
    expect(r.ok && r.value.lotNo).toBe("LOT-77");
    expect(r.ok && r.value.note).toBe("fresh bottle");
    const emitted = await events.events();
    expect(emitted.some((e) => e.payload.type === "LabQcBreached")).toBe(true);
  });

  it("rejects an unknown/inactive parameter", async () => {
    const params = new InMemoryQcParameterStore([{ code: "retired", name: { ar: "ق", en: "R" }, unit: "%", min: 1, max: 2, active: false }]);
    const clock = fixedClock(new Date("2026-06-14T08:00:00.000Z"));
    const svc = new LabQcService(params, new InMemoryQcReadingStore(), new AuditLog(new InMemoryChainStore<AuditPayload>(), clock), new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock));
    const unknown = await svc.record("lab-1", { parameterCode: "nope", value: 1, recordedBy: "lab-1", recordedAt: "2026-06-14T08:00:00.000Z" });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.detailKey).toBe("embryology.qc.unknown_parameter");
    expect((await svc.record("lab-1", { parameterCode: "retired", value: 1, recordedBy: "lab-1", recordedAt: "2026-06-14T08:00:00.000Z" })).ok).toBe(false);
  });

  it("lists parameters and filters the QC log", async () => {
    const { svc } = build();
    expect((await svc.listParameters()).length).toBeGreaterThan(0);
    await svc.record("lab-1", { parameterCode: "incubator_co2", value: 6.0, assetRef: "inc-A", recordedBy: "lab-1", recordedAt: "2026-06-14T08:00:00.000Z" });
    await svc.record("lab-1", { parameterCode: "incubator_co2", value: 6.1, assetRef: "inc-B", recordedBy: "lab-1", recordedAt: "2026-06-14T10:00:00.000Z" });
    await svc.record("lab-1", { parameterCode: "media_ph", value: 7.3, lotNo: "LOT-1", recordedBy: "lab-1", recordedAt: "2026-06-14T09:00:00.000Z" });

    expect((await svc.list({ parameterCode: "incubator_co2" })).length).toBe(2);
    expect((await svc.list({ assetRef: "inc-A" })).length).toBe(1);
    expect((await svc.list({ lotNo: "LOT-1" })).length).toBe(1);
    expect((await svc.list({ since: "2026-06-14T09:30:00.000Z" })).map((r) => r.value)).toEqual([6.1]); // newest-first, only the 10:00 reading
    expect((await svc.list({})).length).toBe(3);
  });
});
