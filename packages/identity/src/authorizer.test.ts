import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, InMemoryChainStore, type AuditPayload } from "@oxford/audit";
import { Authorizer } from "./authorizer.js";
import type { Session } from "./session.js";
import type { Role } from "./rbac.js";

function setup() {
  const audit = new AuditLog(
    new InMemoryChainStore<AuditPayload>(),
    fixedClock(new Date("2026-06-12T10:00:00.000Z")),
  );
  return { audit };
}

const session = (permissions: Role["permissions"], mfa: boolean): Session => ({
  sessionId: "sess-1",
  subject: { staffId: "staff-1", roles: [{ id: "r", name: "r", permissions }] },
  mfa,
});

describe("Authorizer", () => {
  it("allows when the permission is held and no MFA is required", async () => {
    const { audit } = setup();
    const authz = new Authorizer(audit);
    const r = await authz.authorize(session(["admin:settings.read"], false), "admin:settings.read");
    expect(r.ok).toBe(true);
    expect(await audit.entries()).toHaveLength(0); // no denial recorded
  });

  it("denies and audits when the permission is missing", async () => {
    const { audit } = setup();
    const authz = new Authorizer(audit);
    const r = await authz.authorize(session(["clinical:note.read"], true), "financial:invoice.void");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("auth.forbidden");
    const entries = await audit.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.payload.action).toBe("PERMISSION_DENIED");
    expect(entries[0]!.payload.after).toEqual({ required: "financial:invoice.void", reason: "missing-permission" });
  });

  it("requires MFA step-up for protected domains even when permission is held", async () => {
    const { audit } = setup();
    const authz = new Authorizer(audit);
    const r = await authz.authorize(session(["clinical:*"], false), "clinical:note.write");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("auth.mfa_required");
    expect((await audit.entries())[0]!.payload.after).toMatchObject({ reason: "mfa-required" });
  });

  it("allows a protected-domain action once MFA is satisfied", async () => {
    const { audit } = setup();
    const authz = new Authorizer(audit);
    const r = await authz.authorize(session(["clinical:*"], true), "clinical:note.write");
    expect(r.ok).toBe(true);
  });

  it("honours a custom MFA-required domain set", async () => {
    const { audit } = setup();
    const authz = new Authorizer(audit, { mfaRequiredDomains: ["embryology"] });
    // financial no longer requires MFA under this config:
    const ok = await authz.authorize(session(["financial:invoice.read"], false), "financial:invoice.read");
    expect(ok.ok).toBe(true);
    const denied = await authz.authorize(session(["embryology:grade.write"], false), "embryology:grade.write");
    expect(denied.ok).toBe(false);
  });
});
