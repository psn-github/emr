// e2e — one-click audit-trail export per entity THROUGH the tRPC API on real
// Postgres (docs/01 §E12 acceptance: "export a full audit trail for any embryo or
// invoice"; document 03). Proves: an invoice's full who/what/when/before/after
// trail is exported in order, with the hash-chain verified intact; RBAC restricts
// the export to the audit-read permission.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;
const officer: Session = {
  sessionId: "s-comp",
  subject: { staffId: "comp-1", roles: [{ id: "compliance", name: "compliance", permissions: ["admin:audit.read", "financial:invoice.write", "financial:invoice.read"] }] },
  mfa: true,
};
const reception: Session = { sessionId: "s-rec", subject: { staffId: "rec-1", roles: [{ id: "reception", name: "reception", permissions: ["scheduling:*"] }] }, mfa: false };

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected tRPC error ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}
const N = (en: string) => ({ ar: en, en });

describe.skipIf(!DATABASE_URL)("compliance — one-click audit-trail export (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let api: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE billing.invoice, billing.payment, billing.charge, billing.charge_master, audit.audit_log");
    services = buildServices(pool);
    api = appRouter.createCaller({ session: officer, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("exports an invoice's full ordered audit trail with the chain verified intact", async () => {
    // a charge-captured invoice produces an Invoice CREATE then an Invoice UPDATE
    await api.charges.defineCode({ code: "CONSULT", description: N("Consultation"), unitAmountFils: 25000 });
    await api.charges.capture({ patientId: "pat-1", chargeCode: "CONSULT", quantity: 1, source: "clinical", occurredAt: "2026-06-13T08:00:00Z" });
    const inv = await api.charges.invoicePatient({ patientId: "pat-1" });

    const trail = await api.compliance.auditTrail({ entityType: "Invoice", entityId: inv.invoiceId });
    expect(trail.chainIntact).toBe(true);
    expect(trail.count).toBeGreaterThanOrEqual(2);
    // every record is for this invoice and carries who/what/action
    expect(trail.records.every((r) => r.payload.entityType === "Invoice" && r.payload.entityId === inv.invoiceId)).toBe(true);
    expect(trail.records.map((r) => r.payload.action)).toContain("CREATE");
    expect(trail.records.map((r) => r.payload.action)).toContain("UPDATE");
    // ordered by chain sequence
    const seqs = trail.records.map((r) => r.seq);
    expect([...seqs]).toEqual([...seqs].sort((a, b) => a - b));
    // an entity with no history exports an empty (but valid) trail
    const empty = await api.compliance.auditTrail({ entityType: "Embryo", entityId: "nope" });
    expect(empty.count).toBe(0);
    expect(empty.chainIntact).toBe(true);
  });

  it("RBAC: the audit export requires the audit-read permission", async () => {
    const rec = appRouter.createCaller({ session: reception, patient: null, services });
    await expectCode(() => rec.compliance.auditTrail({ entityType: "Invoice", entityId: "x" }), "FORBIDDEN");
  });
});
