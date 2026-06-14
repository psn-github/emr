import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { credentialStatus, validateCredentialDates, validateShift, validateLeave, overlaps } from "./hr.js";
import { HrService } from "./hr-service.js";
import { InMemoryHrStore } from "./store.js";

const ASOF = new Date("2026-06-20T00:00:00Z");

describe("HR logic (pure)", () => {
  it("derives credential expiry status", () => {
    expect(credentialStatus("2026-06-10T00:00:00Z", ASOF, 30)).toBe("expired");
    expect(credentialStatus("2026-07-05T00:00:00Z", ASOF, 30)).toBe("expiring"); // within 30d
    expect(credentialStatus("2026-12-01T00:00:00Z", ASOF, 30)).toBe("valid");
  });
  it("validates credential dates + shift windows + overlap", () => {
    expect(validateCredentialDates("2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z").ok).toBe(true);
    expect(detail(validateCredentialDates("2027-01-01T00:00:00Z", "2026-01-01T00:00:00Z"))).toBe("hr.credential.bad_dates");
    expect(validateShift("2026-06-20T08:00:00Z", "2026-06-20T16:00:00Z").ok).toBe(true);
    expect(detail(validateShift("2026-06-20T16:00:00Z", "2026-06-20T08:00:00Z"))).toBe("hr.shift.bad_window");
    expect(validateLeave("2026-06-20T00:00:00Z", "2026-06-25T00:00:00Z").ok).toBe(true);
    expect(detail(validateLeave("2026-06-25T00:00:00Z", "2026-06-20T00:00:00Z"))).toBe("hr.leave.bad_window");
    expect(overlaps("2026-06-20T08:00:00Z", "2026-06-20T12:00:00Z", "2026-06-20T11:00:00Z", "2026-06-20T14:00:00Z")).toBe(true);
    expect(overlaps("2026-06-20T08:00:00Z", "2026-06-20T10:00:00Z", "2026-06-20T10:00:00Z", "2026-06-20T12:00:00Z")).toBe(false);
  });
});

function build() {
  const clock = fixedClock(ASOF);
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  return { svc: new HrService(new InMemoryHrStore(), audit, events) };
}

describe("HrService", () => {
  it("registers staff, tracks licence/competency expiry, and alerts", async () => {
    const { svc } = build();
    const emb = await svc.registerStaff("hr-1", { name: "Dr Salem", role: "embryologist", professionalId: "MOH-123" });
    const ok1 = await svc.addCredential("hr-1", { staffId: emb.id, type: "licence", name: "MOH licence", authority: "MOH", issuedAt: "2025-01-01T00:00:00Z", expiresAt: "2026-12-01T00:00:00Z" }); // valid
    expect(ok1.ok).toBe(true);
    await svc.addCredential("hr-1", { staffId: emb.id, type: "competency", name: "Witnessing", issuedAt: "2025-06-01T00:00:00Z", expiresAt: "2026-07-05T00:00:00Z" }); // expiring
    await svc.addCredential("hr-1", { staffId: emb.id, type: "competency", name: "ICSI", issuedAt: "2024-01-01T00:00:00Z", expiresAt: "2026-06-10T00:00:00Z" }); // expired

    const alerts = await svc.credentialAlerts(ASOF, 30);
    expect(alerts.expired.map((a) => a.name)).toEqual(["ICSI"]);
    expect(alerts.expiring.map((a) => a.name)).toEqual(["Witnessing"]);

    // informational currency check (does not block)
    expect(await svc.isCredentialCurrent(emb.id, "MOH licence", ASOF)).toBe(true);
    expect(await svc.isCredentialCurrent(emb.id, "ICSI", ASOF)).toBe(false); // expired
    expect(await svc.isCredentialCurrent(emb.id, "Nonexistent", ASOF)).toBe(false);

    expect((await svc.listStaff())).toHaveLength(1);
    expect((await svc.credentials(emb.id))).toHaveLength(3);
  });

  it("plans rota shifts that feed scheduling availability", async () => {
    const { svc } = build();
    const nurse = await svc.registerStaff("hr-1", { name: "Nurse Mona", role: "nurse" });
    const s = await svc.planShift("hr-1", { staffId: nurse.id, resourceId: "theatre-1", start: "2026-06-20T08:00:00Z", end: "2026-06-20T16:00:00Z", role: "scrub" });
    expect(s.ok).toBe(true);
    // a shift overlapping the queried window is returned; one outside is not
    const within = await svc.availability("theatre-1", "2026-06-20T09:00:00Z", "2026-06-20T10:00:00Z");
    expect(within).toHaveLength(1);
    const outside = await svc.availability("theatre-1", "2026-06-21T09:00:00Z", "2026-06-21T10:00:00Z");
    expect(outside).toHaveLength(0);
  });

  it("guards unknown staff and bad windows/dates", async () => {
    const { svc } = build();
    expect(detail(await svc.addCredential("hr-1", { staffId: "ghost", type: "licence", name: "x", issuedAt: "2025-01-01T00:00:00Z", expiresAt: "2026-01-01T00:00:00Z" }))).toBe("hr.staff.not_found");
    expect(detail(await svc.planShift("hr-1", { staffId: "ghost", resourceId: "r", start: "2026-06-20T08:00:00Z", end: "2026-06-20T16:00:00Z", role: "x" }))).toBe("hr.staff.not_found");
    const st = await svc.registerStaff("hr-1", { name: "X", role: "tech" });
    expect(detail(await svc.addCredential("hr-1", { staffId: st.id, type: "licence", name: "x", issuedAt: "2027-01-01T00:00:00Z", expiresAt: "2026-01-01T00:00:00Z" }))).toBe("hr.credential.bad_dates");
    expect(detail(await svc.planShift("hr-1", { staffId: st.id, resourceId: "r", start: "2026-06-20T16:00:00Z", end: "2026-06-20T08:00:00Z", role: "x" }))).toBe("hr.shift.bad_window");
  });

  it("practitioner leave overrides the rota for availability + capacity", async () => {
    const { svc } = build();
    const a = await svc.registerStaff("hr-1", { name: "Dr A", role: "consultant" });
    const b = await svc.registerStaff("hr-1", { name: "Dr B", role: "consultant" });
    const day = { start: "2026-06-20T08:00:00Z", end: "2026-06-20T16:00:00Z" };
    await svc.planShift("hr-1", { staffId: a.id, resourceId: "clinic-1", role: "lead", ...day });
    await svc.planShift("hr-1", { staffId: b.id, resourceId: "clinic-1", role: "lead", ...day });

    // both rostered → capacity 2
    expect(await svc.capacity("clinic-1", "2026-06-20T09:00:00Z", "2026-06-20T10:00:00Z")).toBe(2);

    // Dr A takes annual leave that day
    const lv = await svc.recordLeave("hr-1", { staffId: a.id, type: "annual", start: "2026-06-20T00:00:00Z", end: "2026-06-21T00:00:00Z", note: "family" });
    expect(lv.ok).toBe(true);
    expect(await svc.isOnLeave(a.id, "2026-06-20T09:00:00Z", "2026-06-20T10:00:00Z")).toBe(true);
    expect(await svc.isOnLeave(b.id, "2026-06-20T09:00:00Z", "2026-06-20T10:00:00Z")).toBe(false);

    // availability now excludes Dr A; only Dr B remains → capacity 1
    const avail = await svc.availability("clinic-1", "2026-06-20T09:00:00Z", "2026-06-20T10:00:00Z");
    expect(avail.map((s) => s.staffId)).toEqual([b.id]);
    expect(await svc.capacity("clinic-1", "2026-06-20T09:00:00Z", "2026-06-20T10:00:00Z")).toBe(1);

    // leaveFor only returns periods overlapping the queried window
    expect((await svc.leaveFor(a.id, "2026-06-20T00:00:00Z", "2026-06-21T00:00:00Z")).map((l) => l.type)).toEqual(["annual"]);
    expect(await svc.leaveFor(a.id, "2026-07-01T00:00:00Z", "2026-07-02T00:00:00Z")).toEqual([]);
  });

  it("guards leave for unknown staff and a bad window", async () => {
    const { svc } = build();
    expect(detail(await svc.recordLeave("hr-1", { staffId: "ghost", type: "sick", start: "2026-06-20T00:00:00Z", end: "2026-06-21T00:00:00Z" }))).toBe("hr.staff.not_found");
    const st = await svc.registerStaff("hr-1", { name: "Y", role: "nurse" });
    expect(detail(await svc.recordLeave("hr-1", { staffId: st.id, type: "annual", start: "2026-06-21T00:00:00Z", end: "2026-06-20T00:00:00Z" }))).toBe("hr.leave.bad_window");
    // a valid leave with no note stores note as null
    const ok = await svc.recordLeave("hr-1", { staffId: st.id, type: "study", start: "2026-06-20T00:00:00Z", end: "2026-06-21T00:00:00Z" });
    expect(ok.ok && ok.value.note).toBe(null);
  });
});

function detail(r: { ok: boolean; error?: { detailKey?: string } }): string | undefined {
  return r.ok ? undefined : r.error?.detailKey;
}
