// Integration: invoices/payments persist to Postgres; money round-trips exactly.
// Runs where DATABASE_URL is set.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { BillingService } from "./billing-service.js";
import { PgBillingStore } from "./pg-store.js";

const DATABASE_URL = process.env.DATABASE_URL;
const migration = readFileSync(new URL("../migrations/0001_billing.sql", import.meta.url), "utf8");
const migration2 = readFileSync(new URL("../migrations/0002_billing_refunds.sql", import.meta.url), "utf8");
const migration5 = readFileSync(new URL("../migrations/0005_billing_gateway.sql", import.meta.url), "utf8");

describe.skipIf(!DATABASE_URL)("PgBillingStore", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const clock = fixedClock(new Date("2026-06-13T08:00:00.000Z"));

  beforeAll(async () => {
    await pool.query(migration);
    await pool.query(migration2);
    await pool.query(migration5);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE billing.invoice, billing.payment");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("persists an invoice + payments and marks it paid at zero balance", async () => {
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
    const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
    const svc = new BillingService(new PgBillingStore(pool), audit, events, clock);

    const inv = await svc.createInvoice("fin-1", "pat-1", [{ chargeCode: "CONSULT", description: { ar: "استشارة", en: "Consult" }, unitAmountFils: 25000, quantity: 1 }]);
    if (!inv.ok) throw new Error("setup");
    await svc.postPayment("fin-1", inv.value.id, 25000, "knet");

    const t = await svc.totals(inv.value.id);
    expect(t.ok && t.value.balanceFils).toBe(0);
    const raw = await pool.query<{ status: string }>("SELECT status FROM billing.invoice WHERE id = $1", [inv.value.id]);
    expect(raw.rows[0]!.status).toBe("paid");
    const pay = await pool.query<{ amount_fils: string; kind: string }>("SELECT amount_fils, kind FROM billing.payment WHERE invoice_id = $1", [inv.value.id]);
    expect(Number(pay.rows[0]!.amount_fils)).toBe(25000); // exact fils round-trip
    expect(pay.rows[0]!.kind).toBe("payment");

    // a refund round-trips as an append-only ledger entry and reopens the invoice
    const refund = await svc.refund("fin-1", inv.value.id, 10000, "card", "partial refund");
    expect(refund.ok && refund.value.totals.balanceFils).toBe(10000);
    const reopened = await pool.query<{ status: string }>("SELECT status FROM billing.invoice WHERE id = $1", [inv.value.id]);
    expect(reopened.rows[0]!.status).toBe("open");
    const rows = await pool.query<{ kind: string }>("SELECT kind FROM billing.payment WHERE invoice_id = $1 ORDER BY at", [inv.value.id]);
    expect(rows.rows.map((r) => r.kind)).toEqual(["payment", "refund"]);
  });
});
