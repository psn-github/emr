// ADVERSARIAL SELF-REVIEW (PHI access) — appointments carry a patientId, so the
// schedule is PHI. Prove deny-by-default for the scheduling domain: a role
// without scheduling permission cannot read/book the schedule; reception
// (scheduling domain) can. Enforcement is the Authorizer (the API's gate).
import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, InMemoryChainStore, type AuditPayload } from "@oxford/audit";
import { Authorizer, type Session } from "@oxford/identity";

const audit = () => new AuditLog(new InMemoryChainStore<AuditPayload>(), fixedClock(new Date("2026-06-13T08:00:00.000Z")));
const session = (perms: string[], mfa: boolean): Session => ({
  sessionId: "s", subject: { staffId: "u", roles: [{ id: "r", name: "r", permissions: perms as Session["subject"]["roles"][number]["permissions"] }] }, mfa,
});

describe("ADVERSARIAL: scheduling is PHI-gated", () => {
  it("a role without scheduling permission cannot read the schedule", async () => {
    const authz = new Authorizer(audit());
    const clinicalOnly = session(["clinical:note.read"], true); // no scheduling perm
    const r = await authz.authorize(clinicalOnly, "scheduling:appointment.read");
    console.log("[attack] clinical-only role → scheduling:appointment.read:", r.ok ? "ALLOWED (FAIL)" : "DENIED");
    expect(r.ok).toBe(false);
  });

  it("reception (scheduling domain) can book and read; no MFA needed for non-PHI scheduling", async () => {
    const authz = new Authorizer(audit());
    const reception = session(["scheduling:*"], false);
    expect((await authz.authorize(reception, "scheduling:appointment.book")).ok).toBe(true);
    expect((await authz.authorize(reception, "scheduling:appointment.read")).ok).toBe(true);
  });
});
