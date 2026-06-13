import { describe, expect, it } from "vitest";
import { activePatients, mapInvoice, mapPatient, openInvoices, reconcile } from "./map.js";
import type { ClinikoExport, ClinikoPatient } from "./source.js";

const patient = (over: Partial<ClinikoPatient> = {}): ClinikoPatient => ({
  id: "c1", firstNameEn: "Mohammed", lastNameEn: "Ali", civilId: "284010112345",
  dob: "1984-01-01", sex: "male", nationality: "KW", archived: false, ...over,
});

describe("active-slice filters (Option B)", () => {
  it("keeps only non-archived patients and invoices with a balance", () => {
    const exp: ClinikoExport = {
      patients: [patient(), patient({ id: "c2", archived: true })],
      invoices: [
        { id: "i1", patientId: "c1", descriptionEn: "Consult", outstandingFils: 25000 },
        { id: "i2", patientId: "c1", descriptionEn: "Paid", outstandingFils: 0 },
      ],
      appointments: [],
    };
    expect(activePatients(exp).map((p) => p.id)).toEqual(["c1"]);
    expect(openInvoices(exp).map((i) => i.id)).toEqual(["i1"]);
  });
});

describe("mapPatient", () => {
  it("uses Arabic names when present and carries contact", () => {
    const m = mapPatient(patient({ firstNameAr: "محمد", lastNameAr: "علي", phone: "+96550", email: "m@x.com", preferredLanguage: "en" }));
    expect(m.nameAr).toBe("محمد علي");
    expect(m.nameEn).toBe("Mohammed Ali");
    expect(m.languagePref).toBe("en");
    expect(m.phone).toBe("+96550");
    expect(m.email).toBe("m@x.com");
  });

  it("falls back to English names for Arabic, defaults language to ar, omits absent contact", () => {
    const m = mapPatient(patient());
    expect(m.nameAr).toBe("Mohammed Ali"); // fallback
    expect(m.languagePref).toBe("ar"); // Gulf default
    expect(m.phone).toBeUndefined();
    expect(m.email).toBeUndefined();
  });
});

describe("mapInvoice", () => {
  it("maps with and without an Arabic description", () => {
    expect(mapInvoice({ id: "i1", patientId: "c1", descriptionEn: "Consult", descriptionAr: "استشارة", outstandingFils: 25000 }).descriptionAr).toBe("استشارة");
    expect(mapInvoice({ id: "i2", patientId: "c1", descriptionEn: "Scan", outstandingFils: 15000 }).descriptionAr).toBe("Scan"); // fallback
  });
});

describe("reconcile", () => {
  it("is clean when every source id is imported and nothing extra", () => {
    expect(reconcile(["a", "b"], new Set(["a", "b"])).clean).toBe(true);
  });
  it("flags missing source records", () => {
    const r = reconcile(["a", "b", "c"], new Set(["a"]));
    expect(r.clean).toBe(false);
    expect(r.missing).toEqual(["b", "c"]);
  });
  it("flags extra imported records not in source", () => {
    const r = reconcile(["a"], new Set(["a", "x"]));
    expect(r.clean).toBe(false);
    expect(r.extra).toEqual(["x"]);
  });
});
