import { describe, expect, it } from "vitest";
import { fixedClock, err as errFn, validationError as validationErrorFn } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { ChargeCaptureService } from "./charge-service.js";
import { InMemoryChargeMasterStore, InMemoryChargeStore } from "./charge-store.js";
import { PackageService } from "./package-service.js";
import { InMemoryPackageStore } from "./package-store.js";
import { BillingService } from "./billing-service.js";
import { InMemoryBillingStore } from "./store.js";
import type { PackageInput } from "./packages.js";

const N = (en: string) => ({ ar: en, en });
const T = "2026-06-20T08:00:00Z";

function build() {
  const clock = fixedClock(new Date(T));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const billing = new BillingService(new InMemoryBillingStore(), audit, events, clock);
  const packages = new PackageService(new InMemoryPackageStore(), billing, audit, events, clock);
  const svc = new ChargeCaptureService(new InMemoryChargeMasterStore(), new InMemoryChargeStore(), packages, billing, audit, events);
  return { svc, packages, billing };
}

const pkg: PackageInput = {
  code: "ICSI-PKG",
  name: N("ICSI Package"),
  priceFils: 1000000,
  components: [{ chargeCode: "SCAN", description: N("Scan"), includedQuantity: 4, unitAmountFils: 15000 }],
};

describe("ChargeCaptureService", () => {
  it("defines codes; captures clinical/lab/theatre charges; invoices the billable ones", async () => {
    const { svc } = build();
    await svc.defineChargeCode("fin-1", { code: "CONSULT", description: N("Consultation"), unitAmountFils: 25000 });
    await svc.defineChargeCode("fin-1", { code: "BLOOD", description: N("Blood test"), unitAmountFils: 8000 });

    const c1 = await svc.capture("doc-1", { patientId: "pat-1", chargeCode: "CONSULT", quantity: 1, source: "clinical", occurredAt: T });
    expect(c1.ok && c1.value).toEqual({ recognisedQuantity: 0, billableQuantity: 1, billableAmountFils: 25000 });
    await svc.capture("lab-1", { patientId: "pat-1", chargeCode: "BLOOD", quantity: 2, source: "lab", occurredAt: T });

    expect((await svc.listChargeCodes()).map((m) => m.code).sort()).toEqual(["BLOOD", "CONSULT"]);
    const inv = await svc.invoicePatient("fin-1", "pat-1");
    expect(inv.ok && inv.value.lineCount).toBe(2);
    // re-invoicing finds nothing (the charges are now invoiced)
    expect(detail(await svc.invoicePatient("fin-1", "pat-1"))).toBe("billing.charge.nothing_to_invoice");
    // every charge now carries the invoice id
    const charges = await svc.chargesForPatient("pat-1");
    expect(charges.every((c) => c.invoiceId !== null)).toBe(true);
  });

  it("recognises a charge against a package inclusion; bills only the excess", async () => {
    const { svc, packages } = build();
    await svc.defineChargeCode("fin-1", { code: "SCAN", description: N("Scan"), unitAmountFils: 15000 });
    const def = await packages.definePackage("fin-1", pkg);
    if (!def.ok) return;
    const sold = await packages.sellPackage("fin-1", "pat-1", def.value.id);
    if (!sold.ok) return;
    const ppId = sold.value.patientPackage.id;

    // 5 scans: 4 covered by the package, 1 billable @ 15000
    const cap = await svc.capture("doc-1", { patientId: "pat-1", chargeCode: "SCAN", quantity: 5, source: "clinical", occurredAt: T, patientPackageId: ppId });
    expect(cap.ok && cap.value).toEqual({ recognisedQuantity: 4, billableQuantity: 1, billableAmountFils: 15000 });
    // only the billable scan is on the next invoice
    const inv = await svc.invoicePatient("fin-1", "pat-1");
    expect(inv.ok && inv.value.lineCount).toBe(1);
    // both a recognised and a billable charge were recorded
    const charges = await svc.chargesForPatient("pat-1");
    expect(charges.filter((c) => c.recognised)).toHaveLength(1);
    expect(charges.filter((c) => !c.recognised)).toHaveLength(1);
  });

  it("guards: free-text/unknown code, bad quantity, bad definition, package error", async () => {
    const { svc } = build();
    expect(detail(await svc.defineChargeCode("f", { code: " ", description: N("x"), unitAmountFils: 1 }))).toBe("billing.charge.code_required");
    expect(detail(await svc.defineChargeCode("f", { code: "X", description: { ar: "", en: "x" }, unitAmountFils: 1 }))).toBe("billing.charge.description_required");
    expect(detail(await svc.defineChargeCode("f", { code: "X", description: N("x"), unitAmountFils: -1 }))).toBe("billing.bad_amount");
    expect(detail(await svc.capture("d", { patientId: "p", chargeCode: "UNKNOWN", quantity: 1, source: "clinical", occurredAt: T }))).toBe("billing.charge.code_unknown");
    await svc.defineChargeCode("f", { code: "CONSULT", description: N("Consultation"), unitAmountFils: 25000 });
    expect(detail(await svc.capture("d", { patientId: "p", chargeCode: "CONSULT", quantity: 0, source: "clinical", occurredAt: T }))).toBe("billing.bad_quantity");
    // capturing against an unknown package surfaces the package error
    expect(detail(await svc.capture("d", { patientId: "p", chargeCode: "CONSULT", quantity: 1, source: "clinical", occurredAt: T, patientPackageId: "ghost" }))).toBe("billing.patient_package.not_found");
  });

  it("propagates an invoice-creation failure from invoicePatient", async () => {
    const clock = fixedClock(new Date(T));
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
    const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
    class FailingBilling extends BillingService {
      override async createInvoice() {
        return errFn(validationErrorFn("nope", "billing.empty_invoice"));
      }
    }
    const billing = new FailingBilling(new InMemoryBillingStore(), audit, events, clock);
    const packages = new PackageService(new InMemoryPackageStore(), billing, audit, events, clock);
    const svc = new ChargeCaptureService(new InMemoryChargeMasterStore(), new InMemoryChargeStore(), packages, billing, audit, events);
    await svc.defineChargeCode("f", { code: "CONSULT", description: N("Consultation"), unitAmountFils: 25000 });
    await svc.capture("d", { patientId: "pat-1", chargeCode: "CONSULT", quantity: 1, source: "clinical", occurredAt: T });
    expect(detail(await svc.invoicePatient("f", "pat-1"))).toBe("billing.empty_invoice");
  });
});

function detail(r: { ok: boolean; error?: { detailKey?: string } }): string | undefined {
  return r.ok ? undefined : r.error?.detailKey;
}
