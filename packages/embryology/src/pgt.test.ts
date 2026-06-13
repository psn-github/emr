import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { assertPgtIndicationPermitted, PGT_TYPES } from "./pgt.js";
import { PgtService } from "./pgt-service.js";
import { InMemoryPgtStore } from "./store.js";

describe("PGT indication policy (pure)", () => {
  it("permits only configured (counsel-confirmed) indications; empty config permits none", () => {
    expect(assertPgtIndicationPermitted("aneuploidy_screening", []).ok).toBe(false);
    expect(assertPgtIndicationPermitted("aneuploidy_screening", ["aneuploidy_screening"]).ok).toBe(true);
    const r = assertPgtIndicationPermitted("not_allowed", ["aneuploidy_screening"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("embryology.pgt.indication_not_permitted");
  });
  it("knows the PGT types", () => {
    expect(PGT_TYPES).toContain("PGT-A");
  });
});

function build(permitted: readonly string[]) {
  const clock = fixedClock(new Date("2026-07-01T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  return { svc: new PgtService(new InMemoryPgtStore(), audit, events, permitted), audit, events };
}

const order = (over: Record<string, unknown> = {}) => ({ embryoId: "e-1", cycleId: "cycle-1", type: "PGT-A" as const, indication: "aneuploidy_screening", consentDocumentRef: "consent-1", orderedAt: "2026-07-01T08:00:00Z", ...over });

describe("PgtService", () => {
  it("orders PGT when consent is captured and the indication is permitted", async () => {
    const { svc, audit, events } = build(["aneuploidy_screening"]);
    const r = await svc.orderPgt("doc-1", order());
    expect(r.ok && r.value.type).toBe("PGT-A");
    expect(await svc.orders("cycle-1")).toHaveLength(1);
    expect((await audit.entries())[0]!.payload.entityType).toBe("PgtOrder");
    expect((await events.events())[0]!.payload.type).toBe("PgtOrdered");
  });

  it("rejects an order without consent, and a non-permitted indication", async () => {
    const { svc } = build(["aneuploidy_screening"]);
    const noConsent = await svc.orderPgt("doc-1", order({ consentDocumentRef: "  " }));
    expect(noConsent.ok).toBe(false);
    if (!noConsent.ok) expect(noConsent.error.detailKey).toBe("embryology.pgt.consent_required");
    const notPermitted = await svc.orderPgt("doc-1", order({ indication: "sex_selection" }));
    expect(notPermitted.ok).toBe(false);
    if (!notPermitted.ok) expect(notPermitted.error.detailKey).toBe("embryology.pgt.indication_not_permitted");
  });

  it("records an external genetics-lab result against the order", async () => {
    const { svc } = build(["aneuploidy_screening"]);
    const o = await svc.orderPgt("doc-1", order());
    if (!o.ok) return;
    const result = await svc.recordPgtResult("doc-1", { orderId: o.value.id, embryoId: "e-1", status: "euploid", reportRef: "rep-1", resolvedAt: "2026-07-10T08:00:00Z" });
    expect(result.status).toBe("euploid");
    expect((await svc.resultFor(o.value.id))!.reportRef).toBe("rep-1");
  });
});
