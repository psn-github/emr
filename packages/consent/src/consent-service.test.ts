import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { ConsentService } from "./consent-service.js";
import { InMemoryConsentStore } from "./store.js";

function build() {
  const clock = fixedClock(new Date("2026-06-20T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  return { svc: new ConsentService(new InMemoryConsentStore(), audit, events, clock) };
}

describe("ConsentService — partner access", () => {
  it("grants, gates, and revokes partner access", async () => {
    const { svc } = build();
    expect(await svc.mayAccess("pat-1", "partner-1")).toBe(false); // default: no access

    const g = await svc.grantPartnerAccess("pat-1", "pat-1", "partner-1");
    if (!g.ok) throw new Error("grant failed");
    expect(await svc.mayAccess("pat-1", "partner-1")).toBe(true);
    // a second person not granted has no access
    expect(await svc.mayAccess("pat-1", "stranger")).toBe(false);

    // granting again is idempotent (same active grant)
    const again = await svc.grantPartnerAccess("pat-1", "pat-1", "partner-1");
    expect(again.ok && again.value.id).toBe(g.value.id);

    // revoke → access removed
    expect((await svc.revokePartnerAccess("pat-1", "pat-1", "partner-1")).ok).toBe(true);
    expect(await svc.mayAccess("pat-1", "partner-1")).toBe(false);
    // the grant history is retained (granted + revoked rows visible)
    expect((await svc.grantsForPatient("pat-1"))).toHaveLength(1);
    expect((await svc.grantsForPatient("pat-1"))[0]!.revokedAt).not.toBeNull();
  });

  it("guards: self-grant rejected; revoke with no active grant rejected", async () => {
    const { svc } = build();
    expect(detail(await svc.grantPartnerAccess("p", "pat-1", "pat-1"))).toBe("consent.partner.self");
    expect(detail(await svc.revokePartnerAccess("p", "pat-1", "nobody"))).toBe("consent.partner.no_grant");
  });
});

function detail(r: { ok: boolean; error?: { detailKey?: string } }): string | undefined {
  return r.ok ? undefined : r.error?.detailKey;
}
