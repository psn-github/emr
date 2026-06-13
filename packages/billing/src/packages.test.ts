import { describe, expect, it } from "vitest";
import { fixedClock, err, validationError } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { validatePackage, recognise, type PackageInput } from "./packages.js";
import { PackageService } from "./package-service.js";
import { InMemoryPackageStore } from "./package-store.js";
import { BillingService } from "./billing-service.js";
import { InMemoryBillingStore } from "./store.js";

const N = (en: string) => ({ ar: en, en });
const good: PackageInput = {
  code: "ICSI-PKG",
  name: N("ICSI Package"),
  priceFils: 1500000,
  components: [
    { chargeCode: "CONSULT", description: N("Consultation"), includedQuantity: 1, unitAmountFils: 25000 },
    { chargeCode: "SCAN", description: N("Monitoring scan"), includedQuantity: 4, unitAmountFils: 15000 },
    { chargeCode: "RETRIEVAL", description: N("Oocyte retrieval"), includedQuantity: 1, unitAmountFils: 300000 },
  ],
};

describe("package validation + recognition (pure)", () => {
  it("accepts a well-formed package", () => {
    expect(validatePackage(good).ok).toBe(true);
  });
  it("rejects bad definitions", () => {
    expect(detail(validatePackage({ ...good, code: " " }))).toBe("billing.package.code_required");
    expect(detail(validatePackage({ ...good, name: { ar: "", en: "x" } }))).toBe("billing.package.name_required");
    expect(detail(validatePackage({ ...good, components: [] }))).toBe("billing.package.empty");
    expect(detail(validatePackage({ ...good, priceFils: -1 }))).toBe("billing.bad_amount");
    expect(detail(validatePackage({ ...good, components: [{ chargeCode: "", description: N("x"), includedQuantity: 1, unitAmountFils: 0 }] }))).toBe("billing.package.component_code_required");
    expect(detail(validatePackage({ ...good, components: [good.components[0]!, good.components[0]!] }))).toBe("billing.package.duplicate_component");
    expect(detail(validatePackage({ ...good, components: [{ chargeCode: "X", description: N("x"), includedQuantity: 0, unitAmountFils: 0 }] }))).toBe("billing.package.bad_quantity");
    expect(detail(validatePackage({ ...good, components: [{ chargeCode: "X", description: N("x"), includedQuantity: 1, unitAmountFils: -5 }] }))).toBe("billing.bad_amount");
  });
  it("recognises usage against the inclusion (consume up to remaining; rest extra)", () => {
    expect(recognise(4, 0, 3)).toEqual({ consumed: 3, extra: 0 });
    expect(recognise(4, 3, 3)).toEqual({ consumed: 1, extra: 2 }); // only 1 left
    expect(recognise(4, 4, 2)).toEqual({ consumed: 0, extra: 2 }); // exhausted
  });
});

function build() {
  const clock = fixedClock(new Date("2026-06-20T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const billing = new BillingService(new InMemoryBillingStore(), audit, events, clock);
  const svc = new PackageService(new InMemoryPackageStore(), billing, audit, events, clock);
  return { svc, billing };
}

describe("PackageService", () => {
  it("defines → sells (raises the package-price invoice) → recognises charges → reports", async () => {
    const { svc, billing } = build();
    const def = await svc.definePackage("fin-1", good);
    expect(def.ok).toBe(true);
    if (!def.ok) return;

    const sold = await svc.sellPackage("fin-1", "pat-1", def.value.id);
    expect(sold.ok).toBe(true);
    if (!sold.ok) return;
    // the package-price invoice exists with the right total (no tax)
    const t = await billing.totals(sold.value.invoiceId as never);
    expect(t.ok && t.value.totalFils).toBe(1500000);

    const ppId = sold.value.patientPackage.id;
    // 3 scans are within the 4 included → all recognised, no extra
    const c1 = await svc.captureCharge("fin-1", ppId, "SCAN", 3);
    expect(c1.ok && c1.value).toEqual({ inPackage: true, consumed: 3, extra: 0, extraAmountFils: 0 });
    // 2 more scans: only 1 left included → 1 consumed, 1 extra @ 15000
    const c2 = await svc.captureCharge("fin-1", ppId, "SCAN", 2);
    expect(c2.ok && c2.value).toEqual({ inPackage: true, consumed: 1, extra: 1, extraAmountFils: 15000 });
    // a charge not in the package → entirely extra, unvalued here (billed via 5.5)
    const c3 = await svc.captureCharge("fin-1", ppId, "DRUGS", 1);
    expect(c3.ok && c3.value).toEqual({ inPackage: false, consumed: 0, extra: 1, extraAmountFils: 0 });

    const rep = await svc.recognitionReport(ppId);
    expect(rep.ok).toBe(true);
    if (rep.ok) {
      const scan = rep.value.find((r) => r.chargeCode === "SCAN")!;
      expect(scan).toEqual({ chargeCode: "SCAN", includedQuantity: 4, consumedQuantity: 4, remainingQuantity: 0, recognisedFils: 60000 });
    }
    // read side
    expect((await svc.listPackages()).map((p) => p.code)).toEqual(["ICSI-PKG"]);
    expect((await svc.packageById(def.value.id))!.code).toBe("ICSI-PKG");
    expect((await svc.patientPackageById(ppId))!.patientId).toBe("pat-1");
  });

  it("guards: unknown/inactive package, unknown/cancelled patient package, bad quantity", async () => {
    const { svc } = build();
    expect(detail(await svc.sellPackage("f", "p", "ghost"))).toBe("billing.package.not_found");
    expect(detail(await svc.setPackageActive("f", "ghost", false))).toBe("billing.package.not_found");
    expect(detail(await svc.cancelPatientPackage("f", "ghost"))).toBe("billing.patient_package.not_found");
    expect(detail(await svc.captureCharge("f", "ghost", "SCAN", 1))).toBe("billing.patient_package.not_found");
    expect(detail(await svc.recognitionReport("ghost"))).toBe("billing.patient_package.not_found");

    // an invalid definition is rejected through the service (validation flows in)
    expect(detail(await svc.definePackage("f", { ...good, components: [] }))).toBe("billing.package.empty");

    const def = await svc.definePackage("f", good);
    if (!def.ok) return;
    // a deactivated package cannot be sold
    await svc.setPackageActive("f", def.value.id, false);
    expect(detail(await svc.sellPackage("f", "pat-1", def.value.id))).toBe("billing.package.inactive");
    await svc.setPackageActive("f", def.value.id, true);

    const sold = await svc.sellPackage("f", "pat-1", def.value.id);
    if (!sold.ok) return;
    expect(detail(await svc.captureCharge("f", sold.value.patientPackage.id, "SCAN", 0))).toBe("billing.bad_quantity");
    // a cancelled patient package rejects further capture
    await svc.cancelPatientPackage("f", sold.value.patientPackage.id);
    expect(detail(await svc.captureCharge("f", sold.value.patientPackage.id, "SCAN", 1))).toBe("billing.patient_package.inactive");
  });

  it("propagates an invoice-creation failure from sellPackage", async () => {
    const clock = fixedClock(new Date("2026-06-20T08:00:00.000Z"));
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
    const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
    // a billing whose createInvoice always fails (e.g. downstream rejection)
    class FailingBilling extends BillingService {
      override async createInvoice() {
        return err(validationError("nope", "billing.empty_invoice"));
      }
    }
    const billing = new FailingBilling(new InMemoryBillingStore(), audit, events, clock);
    const svc = new PackageService(new InMemoryPackageStore(), billing, audit, events, clock);
    const def = await svc.definePackage("f", good);
    if (!def.ok) return;
    const sold = await svc.sellPackage("f", "pat-1", def.value.id);
    expect(detail(sold)).toBe("billing.empty_invoice");
  });
});

function detail(r: { ok: boolean; error?: { detailKey?: string } }): string | undefined {
  return r.ok ? undefined : r.error?.detailKey;
}
