import { describe, expect, it } from "vitest";
import { fixedClock, unauthenticated, err, ok, type Result } from "@oxford/core";
import { AuditLog, InMemoryChainStore, type AuditPayload } from "@oxford/audit";
import { AuthService } from "./auth-service.js";
import { DevOidcProvider, type OidcClaims, type OidcProvider } from "./oidc.js";
import type { AuthSubject } from "./rbac.js";

const clock = () => fixedClock(new Date("2026-06-12T10:00:00.000Z"));
const auditLog = () => new AuditLog(new InMemoryChainStore<AuditPayload>(), clock());

const staffSubject: AuthSubject = {
  staffId: "staff-1",
  roles: [{ id: "nurse", name: "nurse", permissions: ["clinical:note.read"] }],
};

describe("AuthService", () => {
  it("authenticates a provisioned subject and audits LOGIN", async () => {
    const audit = auditLog();
    const svc = new AuthService(new DevOidcProvider(false), async () => staffSubject, audit);
    const token = `dev:${JSON.stringify({ sub: "idp-1", amr: ["pwd", "mfa"] })}`;
    const r = await svc.authenticate(token);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.subject.staffId).toBe("staff-1");
      expect(r.value.mfa).toBe(true);
    }
    const entries = await audit.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.payload.action).toBe("LOGIN");
    expect(entries[0]!.payload.after).toEqual({ mfa: true });
  });

  it("audits LOGIN_FAILED on an invalid token", async () => {
    const audit = auditLog();
    const svc = new AuthService(new DevOidcProvider(false), async () => staffSubject, audit);
    const r = await svc.authenticate("garbage");
    expect(r.ok).toBe(false);
    const entries = await audit.entries();
    expect(entries[0]!.payload.action).toBe("LOGIN_FAILED");
    expect(entries[0]!.payload.after).toEqual({ reason: "auth.token.invalid" });
  });

  it("falls back to a generic reason when the provider error has no detailKey", async () => {
    const audit = auditLog();
    const bareProvider: OidcProvider = {
      verifyToken: async (): Promise<Result<OidcClaims, ReturnType<typeof unauthenticated>>> =>
        err(unauthenticated("nope")),
    };
    const svc = new AuthService(bareProvider, async () => staffSubject, audit);
    const r = await svc.authenticate("anything");
    expect(r.ok).toBe(false);
    expect((await audit.entries())[0]!.payload.after).toEqual({ reason: "token-invalid" });
  });

  it("rejects a verified token whose subject is not provisioned", async () => {
    const audit = auditLog();
    const provider: OidcProvider = {
      verifyToken: async () => ok<OidcClaims>({ sub: "idp-x" }),
    };
    const svc = new AuthService(provider, async () => null, audit);
    const r = await svc.authenticate("anything");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("auth.not_provisioned");
    const entries = await audit.entries();
    expect(entries[0]!.payload.action).toBe("LOGIN_FAILED");
    expect(entries[0]!.payload.after).toEqual({ reason: "not-provisioned" });
  });
});
