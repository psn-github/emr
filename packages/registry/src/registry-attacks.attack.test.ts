// ADVERSARIAL SELF-REVIEW (attacks b, c, d) for the registry / identity safety
// surfaces, run against a real Postgres (DATABASE_URL; CI provides one). Each
// test attempts the attack and proves the server rejects it. If any attack
// succeeded, this suite would fail and the registry would not be merged.
//
//   (b) start a fertility workflow for a couple with NO verified marriage,
//       via the server-side enforcement path (not the UI) — must be rejected.
//   (c) read the Civil ID straight from the database — must be encrypted at rest.
//   (d) access embryology data with a non-embryology role — deny-by-default holds.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { LocalKeyProvider } from "@oxford/crypto";
import { Authorizer, type Session } from "@oxford/identity";
import { RegistryService } from "./registry-service.js";
import { PgRegistryStore } from "./pg-store.js";

const DATABASE_URL = process.env.DATABASE_URL;
const migration = readFileSync(new URL("../migrations/0001_registry.sql", import.meta.url), "utf8");
const CIVIL_ID = "284010112345";

function buildService(pool: pg.Pool) {
  const clock = fixedClock(new Date("2026-06-12T11:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  return { service: new RegistryService(new PgRegistryStore(pool), new LocalKeyProvider(false), audit, events, clock), audit };
}

const husband = { name: { ar: "محمد", en: "Mohammed" }, civilId: CIVIL_ID, dob: "1984-01-01", sex: "male" as const, nationality: "KW", languagePref: "ar" as const };
const wife = { name: { ar: "سارة", en: "Sara" }, civilId: "286050167890", dob: "1986-05-01", sex: "female" as const, nationality: "KW", languagePref: "ar" as const };

describe.skipIf(!DATABASE_URL)("ADVERSARIAL: registry & identity safety surfaces", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  beforeAll(async () => {
    await pool.query(migration);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE registry.person, registry.couple, registry.marriage_verification");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("(b) refuses to start a fertility workflow without a verified marriage — server-side", async () => {
    const { service } = buildService(pool);
    const h = await service.registerPerson("staff-1", husband);
    const w = await service.registerPerson("staff-1", wife);
    const created = await service.createCouple("staff-1", h.id, w.id);
    if (!created.ok) throw new Error("setup failed");

    // ATTACK: try to begin fertility for the unverified couple via the same
    // server-side gate the API route invokes (canStartFertility), not the UI.
    const blocked = await service.canStartFertility(created.value.id);
    console.log("[attack b] start fertility, NO marriage record →", blocked.ok ? "ALLOWED (FAIL)" : `REJECTED (${blocked.ok ? "" : blocked.error.detailKey})`);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.detailKey).toBe("registry.marriage.unverified");

    // Control: once a marriage IS verified, the same call is permitted.
    await service.verifyMarriage("registrar", created.value.id, { documentRef: "doc-1", method: "certificate" });
    const allowed = await service.canStartFertility(created.value.id);
    console.log("[attack b] start fertility, marriage verified →", allowed.ok ? "ALLOWED (correct)" : "REJECTED (FAIL)");
    expect(allowed.ok).toBe(true);
  });

  it("(c) stores the Civil ID encrypted at rest — raw DB read yields no plaintext", async () => {
    const { service } = buildService(pool);
    const person = await service.registerPerson("staff-1", husband);

    // ATTACK: read the Civil ID directly from the database, bypassing the app.
    const raw = await pool.query<{ civil_id_enc: string }>(
      "SELECT civil_id_enc FROM registry.person WHERE id = $1",
      [person.id],
    );
    const atRest = raw.rows[0]!.civil_id_enc;
    console.log("[attack c] raw civil_id_enc at rest:", atRest.slice(0, 24) + "…");
    console.log("[attack c] contains plaintext Civil ID?", atRest.includes(CIVIL_ID) ? "YES (FAIL)" : "NO (encrypted)");
    expect(atRest).not.toContain(CIVIL_ID); // plaintext is NOT in the DB
    expect(atRest.startsWith("v1.")).toBe(true); // it's the AES-GCM envelope

    // The value is still recoverable through the audited service path.
    const revealed = await service.revealCivilId("auditor", person.id);
    expect(revealed.ok && revealed.value).toBe(CIVIL_ID);
  });

  it("(d) denies embryology data to a non-embryology role — deny-by-default holds", async () => {
    const { audit } = buildService(pool);
    const authz = new Authorizer(audit);
    // A clinical nurse session: clinical access, but NO embryology permission.
    const nurse: Session = {
      sessionId: "sess-nurse",
      subject: { staffId: "nurse-1", roles: [{ id: "nurse", name: "nurse", permissions: ["clinical:note.read"] }] },
      mfa: true, // MFA satisfied — so the denial is purely about the missing permission
    };

    // ATTACK: a non-embryology role tries to read embryology lab data.
    const blocked = await authz.authorize(nurse, "embryology:lab.read");
    console.log("[attack d] non-embryology role → embryology:lab.read:", blocked.ok ? "ALLOWED (FAIL)" : `DENIED (${blocked.ok ? "" : blocked.error.detailKey})`);
    expect(blocked.ok).toBe(false);

    // Control: a properly-credentialled embryologist (with MFA) is permitted.
    const embryologist: Session = {
      sessionId: "sess-embryo",
      subject: { staffId: "embryo-1", roles: [{ id: "embryologist", name: "embryologist", permissions: ["embryology:*"] }] },
      mfa: true,
    };
    const allowed = await authz.authorize(embryologist, "embryology:lab.read");
    console.log("[attack d] embryologist → embryology:lab.read:", allowed.ok ? "ALLOWED (correct)" : "DENIED (FAIL)");
    expect(allowed.ok).toBe(true);
  });
});
