// ADVERSARIAL SELF-REVIEW (clinical PHI) — clinical notes/results are the most
// sensitive PHI. Prove: (1) deny-by-default for clinical reads to non-clinical
// roles; (2) notes are APPEND-ONLY — an "edit" cannot destroy the prior version.
import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { Authorizer, type Session } from "@oxford/identity";
import { ClinicalService } from "./clinical-service.js";
import { InMemoryClinicalStore } from "./store.js";

const clock = () => fixedClock(new Date("2026-06-13T08:00:00.000Z"));
const session = (perms: string[], mfa: boolean): Session => ({
  sessionId: "s", subject: { staffId: "u", roles: [{ id: "r", name: "r", permissions: perms as Session["subject"]["roles"][number]["permissions"] }] }, mfa,
});

describe("ADVERSARIAL: clinical PHI is gated and notes are append-only", () => {
  it("a non-clinical role is denied clinical reads", async () => {
    const authz = new Authorizer(new AuditLog(new InMemoryChainStore<AuditPayload>(), clock()));
    const reception = session(["scheduling:*"], false);
    const note = await authz.authorize(reception, "clinical:note.read");
    const res = await authz.authorize(reception, "clinical:result.read");
    console.log("[attack] reception → clinical:note.read:", note.ok ? "ALLOWED (FAIL)" : "DENIED");
    expect(note.ok).toBe(false);
    expect(res.ok).toBe(false);
    // A clinician WITH MFA is allowed.
    expect((await authz.authorize(session(["clinical:*"], true), "clinical:note.read")).ok).toBe(true);
  });

  it("clinical access requires MFA even with the permission", async () => {
    const authz = new Authorizer(new AuditLog(new InMemoryChainStore<AuditPayload>(), clock()));
    const noMfa = await authz.authorize(session(["clinical:*"], false), "clinical:note.read");
    expect(noMfa.ok).toBe(false);
    if (!noMfa.ok) expect(noMfa.error.detailKey).toBe("auth.mfa_required");
  });

  it("amending a note cannot erase the original version", async () => {
    const c = clock();
    const svc = new ClinicalService(
      new InMemoryClinicalStore(),
      new AuditLog(new InMemoryChainStore<AuditPayload>(), c),
      new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), c),
      c,
    );
    const enc = await svc.openEncounter("doc-1", "pat-1", "new_fertility", "doc-1");
    const note = await svc.writeNote("doc-1", enc.id, "pat-1", { plan: "original" });
    // ATTACK: try to overwrite the clinical record by "amending" it.
    await svc.amendNote("doc-2", note.id, { plan: "rewritten" });
    const persisted = await svc.getNote(note.id);
    console.log("[attack] amend keeps original v1?", persisted!.versions[0]!.body);
    expect(persisted!.versions).toHaveLength(2);
    expect(persisted!.versions[0]!.body).toEqual({ plan: "original" }); // v1 intact
    expect(persisted!.versions[1]!.authorId).toBe("doc-2"); // amendment attributed
  });
});
