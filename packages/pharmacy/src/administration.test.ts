import { describe, expect, it } from "vitest";
import {
  nextStatus,
  validatePrescriptionItems,
  screenPrescription,
  validateTheatreDrugs,
  controlledDrugItems,
  assertColdChainHandled,
  assertWitnessForControlled,
  assertSufficientStock,
  totalAllocated,
  assertAllocationsCoverItems,
  type DrugLine,
} from "./administration.js";
import type { PrescriptionItem, PrescriptionItemInput, TheatreDrugInput, StockAllocation, PrescriptionStatus } from "./types.js";

// Pure pharmacy drug-safety logic — 100% coverage (CLAUDE.md drugs bar).

const item = (over: Partial<PrescriptionItem> = {}): PrescriptionItem => ({
  drugId: "rfsh",
  quantity: 2,
  doseInstruction: { en: "225 IU daily", ar: "225 وحدة يومياً" },
  nameEn: "Recombinant FSH",
  nameAr: "هرمون منبه للجريب",
  drugClass: "gonadotropin_fsh",
  controlled: false,
  coldChain: false,
  ...over,
});
const input = (over: Partial<PrescriptionItemInput> = {}): PrescriptionItemInput => ({
  drugId: "rfsh",
  quantity: 2,
  doseInstruction: { en: "225 IU daily", ar: "225 وحدة يومياً" },
  ...over,
});
const line = (over: Partial<DrugLine> = {}): DrugLine => ({ drugId: "propofol", quantity: 2, controlled: false, coldChain: false, ...over });
const key = (r: { ok: boolean; error?: { detailKey?: string } }): string | undefined => (r.ok ? undefined : r.error?.detailKey);

describe("nextStatus lifecycle (ADR-0069)", () => {
  it("advances pending → issued → fulfilled", () => {
    expect(nextStatus("pending", "issue")).toEqual({ ok: true, value: "issued" });
    expect(nextStatus("issued", "fulfil")).toEqual({ ok: true, value: "fulfilled" });
  });
  it("cancels a pending OR issued prescription (pre-fulfilment)", () => {
    expect(nextStatus("pending", "cancel")).toEqual({ ok: true, value: "cancelled" });
    expect(nextStatus("issued", "cancel")).toEqual({ ok: true, value: "cancelled" });
    expect(key(nextStatus("fulfilled", "cancel"))).toBe("pharmacy.status.invalid_transition");
    expect(key(nextStatus("cancelled", "cancel"))).toBe("pharmacy.status.invalid_transition");
  });
  it("rejects every out-of-order transition", () => {
    const bad: Array<[PrescriptionStatus, "issue" | "fulfil"]> = [
      ["issued", "issue"],
      ["fulfilled", "issue"],
      ["cancelled", "issue"],
      ["pending", "fulfil"],
      ["fulfilled", "fulfil"],
      ["cancelled", "fulfil"],
    ];
    for (const [status, action] of bad) {
      const r = nextStatus(status, action);
      expect(r.ok).toBe(false);
      expect(key(r)).toBe("pharmacy.status.invalid_transition");
    }
  });
});

describe("validatePrescriptionItems", () => {
  it("accepts a well-formed set", () => {
    expect(validatePrescriptionItems([input()]).ok).toBe(true);
  });
  it("rejects an empty prescription", () => {
    expect(key(validatePrescriptionItems([]))).toBe("pharmacy.rx.empty");
  });
  it("rejects a non-integer or non-positive quantity", () => {
    expect(key(validatePrescriptionItems([input({ quantity: 1.5 })]))).toBe("pharmacy.rx.quantity_invalid");
    expect(key(validatePrescriptionItems([input({ quantity: 0 })]))).toBe("pharmacy.rx.quantity_invalid");
    expect(key(validatePrescriptionItems([input({ quantity: -3 })]))).toBe("pharmacy.rx.quantity_invalid");
  });
  it("requires a dose instruction in both languages", () => {
    expect(key(validatePrescriptionItems([input({ doseInstruction: { en: "", ar: "x" } })]))).toBe("pharmacy.rx.dose_required");
    expect(key(validatePrescriptionItems([input({ doseInstruction: { en: "x", ar: "  " } })]))).toBe("pharmacy.rx.dose_required");
  });
});

describe("screenPrescription (allergy advisory)", () => {
  it("returns nothing when the patient has no recorded allergies", () => {
    expect(screenPrescription([item()], [])).toEqual([]);
  });
  it("flags each item whose drug class matches, ignores the rest", () => {
    const items = [item(), item({ drugId: "gnrh_antagonist", drugClass: "gnrh_antagonist" })];
    expect(screenPrescription(items, ["gonadotropin_fsh"])).toEqual([{ drugId: "rfsh", drugClass: "gonadotropin_fsh" }]);
    expect(screenPrescription(items, ["progesterone"])).toEqual([]);
  });
});

describe("validateTheatreDrugs", () => {
  it("accepts a well-formed set", () => {
    const drugs: TheatreDrugInput[] = [{ drugId: "propofol", quantity: 2 }];
    expect(validateTheatreDrugs(drugs).ok).toBe(true);
  });
  it("rejects an empty administration", () => {
    expect(key(validateTheatreDrugs([]))).toBe("pharmacy.admin.empty");
  });
  it("rejects a non-integer or non-positive quantity", () => {
    expect(key(validateTheatreDrugs([{ drugId: "propofol", quantity: 1.5 }]))).toBe("pharmacy.admin.quantity_invalid");
    expect(key(validateTheatreDrugs([{ drugId: "propofol", quantity: 0 }]))).toBe("pharmacy.admin.quantity_invalid");
    expect(key(validateTheatreDrugs([{ drugId: "propofol", quantity: -1 }]))).toBe("pharmacy.admin.quantity_invalid");
  });
});

describe("controlledDrugItems", () => {
  it("selects only the controlled items", () => {
    const items = [line(), line({ drugId: "fentanyl", controlled: true })];
    expect(controlledDrugItems(items).map((i) => i.drugId)).toEqual(["fentanyl"]);
  });
});

describe("assertColdChainHandled", () => {
  it("requires the assertion only when a cold-chain item is present", () => {
    expect(assertColdChainHandled([line()], false).ok).toBe(true); // no cold-chain item
    expect(assertColdChainHandled([line({ coldChain: true })], true).ok).toBe(true);
    expect(key(assertColdChainHandled([line({ coldChain: true })], false))).toBe("pharmacy.admin.cold_chain_required");
  });
});

describe("assertWitnessForControlled", () => {
  it("requires a witness only when a controlled item is present", () => {
    expect(assertWitnessForControlled([line()], undefined).ok).toBe(true); // no controlled item
    expect(assertWitnessForControlled([line({ controlled: true })], "nurse-2").ok).toBe(true);
    expect(key(assertWitnessForControlled([line({ controlled: true })], undefined))).toBe("pharmacy.admin.witness_required");
    expect(key(assertWitnessForControlled([line({ controlled: true })], "  "))).toBe("pharmacy.admin.witness_required");
  });
});

describe("assertSufficientStock", () => {
  it("passes when every item is covered, fails on any shortfall", () => {
    const items = [line({ drugId: "a", quantity: 2 }), line({ drugId: "b", quantity: 1 })];
    expect(assertSufficientStock(items, new Map([["a", 2], ["b", 5]])).ok).toBe(true);
    expect(key(assertSufficientStock(items, new Map([["a", 1], ["b", 5]])))).toBe("pharmacy.admin.insufficient_stock");
    // a drug with no entry defaults to 0 on hand
    expect(key(assertSufficientStock(items, new Map([["b", 5]])))).toBe("pharmacy.admin.insufficient_stock");
  });
});

describe("allocation math", () => {
  const allocs: StockAllocation[] = [
    { drugId: "a", lotNo: "L1", expiry: "2027-01-01", quantity: 1 },
    { drugId: "a", lotNo: "L2", expiry: "2027-02-01", quantity: 1 },
    { drugId: "b", lotNo: "L3", expiry: "2027-03-01", quantity: 1 },
  ];
  it("totalAllocated sums per drug", () => {
    expect(totalAllocated(allocs, "a")).toBe(2);
    expect(totalAllocated(allocs, "b")).toBe(1);
    expect(totalAllocated(allocs, "z")).toBe(0);
  });
  it("assertAllocationsCoverItems requires an exact cover", () => {
    const items = [line({ drugId: "a", quantity: 2 }), line({ drugId: "b", quantity: 1 })];
    expect(assertAllocationsCoverItems(items, allocs).ok).toBe(true);
    expect(key(assertAllocationsCoverItems([line({ drugId: "a", quantity: 3 })], allocs))).toBe("pharmacy.admin.allocation_mismatch");
  });
});
