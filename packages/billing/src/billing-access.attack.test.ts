// ADVERSARIAL SELF-REVIEW (money) — billing is money. Prove: (1) only a
// financial role (with MFA) can post payments; reception is denied; (2) money is
// exact integer fils — no float drift; (3) overpayment is impossible.
import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { Authorizer, type Session } from "@oxford/identity";
import { BillingService } from "./billing-service.js";
import { InMemoryBillingStore } from "./store.js";
import { subtotal, lineTotal } from "./money.js";

const session = (perms: string[], mfa: boolean): Session => ({
  sessionId: "s", subject: { staffId: "u", roles: [{ id: "r", name: "r", permissions: perms as Session["subject"]["roles"][number]["permissions"] }] }, mfa,
});

describe("ADVERSARIAL: money is gated and exact", () => {
  it("reception cannot post payments; a financial role (with MFA) can", async () => {
    const authz = new Authorizer(new AuditLog(new InMemoryChainStore<AuditPayload>(), fixedClock(new Date("2026-06-13T08:00:00Z"))));
    const reception = await authz.authorize(session(["scheduling:*"], false), "financial:payment.post");
    console.log("[attack] reception → financial:payment.post:", reception.ok ? "ALLOWED (FAIL)" : "DENIED");
    expect(reception.ok).toBe(false);
    // financial role needs MFA too (money domain):
    expect((await authz.authorize(session(["financial:*"], false), "financial:payment.post")).ok).toBe(false);
    expect((await authz.authorize(session(["financial:*"], true), "financial:payment.post")).ok).toBe(true);
  });

  it("money totals are exact (no float drift across many small lines)", () => {
    // 3 × 0.001 KWD lines = 0.003 KWD exactly (1+1+1 fils), not 0.0029999…
    const total = subtotal([lineTotal(1, 1), lineTotal(1, 1), lineTotal(1, 1)]);
    expect(total).toBe(3);
  });

  it("overpayment is rejected by the service", async () => {
    const clock = fixedClock(new Date("2026-06-13T08:00:00Z"));
    const svc = new BillingService(
      new InMemoryBillingStore(),
      new AuditLog(new InMemoryChainStore<AuditPayload>(), clock),
      new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock),
      clock,
    );
    const inv = await svc.createInvoice("fin-1", "pat-1", [{ chargeCode: "C", description: { ar: "C", en: "C" }, unitAmountFils: 10000, quantity: 1 }]);
    if (!inv.ok) throw new Error("setup");
    const attack = await svc.postPayment("fin-1", inv.value.id, 10001, "cash"); // 1 fil over
    console.log("[attack] pay 10001 against 10000 balance:", attack.ok ? "ACCEPTED (FAIL)" : "REJECTED");
    expect(attack.ok).toBe(false);
  });
});
