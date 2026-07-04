import { describe, expect, it } from "vitest";
import {
  formatFilsKwd,
  prescriptionPrint,
  receiptPrint,
  appointmentSlipPrint,
  clinicalLetterPrint,
  theatreListPrint,
  pullListPrint,
  type PrintLocale,
} from "./print.js";

const CLINIC = { en: "Oxford Medical Kuwait", ar: "أكسفورد الطبية الكويت" };
const PATIENT = { en: "Sara Al-Ali", ar: "سارة العلي" };
const LOCALES: PrintLocale[] = ["en", "ar"];

/** Every artefact is bilingual regardless of locale: both language facts must be
 *  present in BOTH passes, and the doc dir must follow the locale. */
function assertBilingual(html: string, locale: PrintLocale): void {
  expect(html).toContain("<!DOCTYPE html>");
  expect(html).toContain(`lang="${locale}"`);
  expect(html).toContain(`dir="${locale === "ar" ? "rtl" : "ltr"}"`);
  expect(html).toContain("Sara Al-Ali"); // en fact
  expect(html).toContain("سارة العلي"); // ar fact
}

describe("formatFilsKwd (3-decimal KWD, integer fils)", () => {
  it("formats positive and negative amounts to 3 decimals", () => {
    expect(formatFilsKwd(25_000)).toBe("25.000 KWD");
    expect(formatFilsKwd(1_500_500)).toBe("1500.500 KWD");
    expect(formatFilsKwd(0)).toBe("0.000 KWD");
    expect(formatFilsKwd(-2_000)).toBe("-2.000 KWD");
  });
});

describe("prescriptionPrint", () => {
  for (const locale of LOCALES) {
    it(`renders bilingually (${locale})`, () => {
      const html = prescriptionPrint(
        {
          clinicName: CLINIC,
          patientName: PATIENT,
          mrn: "OM-2026-00042",
          prescriber: "Dr Nelson",
          issuedAt: "2026-07-03T09:00:00.000Z",
          items: [
            { name: { en: "Recombinant FSH", ar: "الهرمون المنبه للجريب" }, quantity: 2, dose: { en: "225 IU daily", ar: "225 وحدة يومياً" } },
          ],
        },
        locale,
      );
      assertBilingual(html, locale);
      expect(html).toContain("OM-2026-00042");
      expect(html).toContain("Recombinant FSH");
      expect(html).toContain("الهرمون المنبه للجريب");
      expect(html).toContain("225 IU daily");
      expect(html).toContain("Dr Nelson");
    });
  }
});

describe("receiptPrint (no cash, no tax — structural)", () => {
  const base = {
    clinicName: CLINIC,
    receiptNo: "RCPT-ABCD1234",
    issuedAt: "2026-07-03T09:00:00.000Z",
    patientName: PATIENT,
    mrn: "OM-2026-00042",
    lines: [{ description: { en: "Consultation", ar: "استشارة" }, quantity: 1, unitAmountFils: 25_000, lineTotalFils: 25_000 }],
    totalFils: 25_000,
  };

  for (const locale of LOCALES) {
    it(`renders a KNET receipt bilingually with NO tax/cash anywhere (${locale})`, () => {
      const html = receiptPrint(
        { ...base, paidFils: 25_000, balanceFils: 0, payment: { method: "knet", amountFils: 25_000 } },
        locale,
      );
      assertBilingual(html, locale);
      expect(html).toContain("RCPT-ABCD1234");
      expect(html).toContain("25.000 KWD");
      expect(html).toContain("KNET");
      // No tax, ever (ADR-0035); no cash, ever (ADR-0034).
      expect(html.toLowerCase()).not.toContain("tax");
      expect(html).not.toContain("ضريبة");
      expect(html.toLowerCase()).not.toContain("cash");
      expect(html).not.toContain("نقد");
    });
  }

  it("renders a card payment", () => {
    const html = receiptPrint({ ...base, paidFils: 25_000, balanceFils: 0, payment: { method: "card", amountFils: 25_000 } }, "en");
    expect(html).toContain("Card");
  });

  it("renders an unpaid receipt (no payment)", () => {
    const html = receiptPrint({ ...base, paidFils: 0, balanceFils: 25_000, payment: null }, "ar");
    expect(html).toContain("غير مدفوع");
  });
});

describe("appointmentSlipPrint", () => {
  const base = {
    clinicName: CLINIC,
    patientName: PATIENT,
    mrn: "OM-2026-00042",
    appointmentType: { en: "Monitoring scan", ar: "أشعة متابعة" },
    practitioner: { en: "Dr Nelson", ar: "د. نيلسون" },
    start: "2026-09-10T09:00:00.000Z",
  };
  for (const locale of LOCALES) {
    it(`renders with prep + location (${locale})`, () => {
      const html = appointmentSlipPrint({ ...base, location: "L3/Consult-2", prep: { en: "Full bladder", ar: "مثانة ممتلئة" } }, locale);
      assertBilingual(html, locale);
      expect(html).toContain("Monitoring scan");
      expect(html).toContain("أشعة متابعة");
      expect(html).toContain("L3/Consult-2");
      expect(html).toContain("Full bladder");
    });
  }
  it("omits the optional prep + location cleanly", () => {
    const html = appointmentSlipPrint(base, "en");
    expect(html).not.toContain("Preparation");
    expect(html).not.toContain("Location");
  });
});

describe("clinicalLetterPrint", () => {
  for (const locale of LOCALES) {
    it(`renders a letterhead + body (${locale})`, () => {
      const html = clinicalLetterPrint(
        {
          clinicName: CLINIC,
          patientName: PATIENT,
          mrn: "OM-2026-00042",
          issuedAt: "2026-07-03T09:00:00.000Z",
          reference: "REF-2026-01",
          paragraphs: ["To whom it may concern,", "This confirms treatment."],
          signatory: "Dr Nelson, Consultant",
        },
        locale,
      );
      assertBilingual(html, locale);
      expect(html).toContain("REF-2026-01");
      expect(html).toContain("To whom it may concern,");
      expect(html).toContain("Dr Nelson, Consultant");
    });
  }
});

describe("theatreListPrint", () => {
  for (const locale of LOCALES) {
    it(`renders a day's cases table (${locale})`, () => {
      const html = theatreListPrint(
        {
          clinicName: CLINIC,
          date: "2026-09-05",
          cases: [
            { patientName: PATIENT, mrn: "OM-2026-00042", procedure: "Oocyte retrieval", theatre: "Theatre-1", surgeon: "Dr Nelson", start: "2026-09-05T08:00:00.000Z", end: "2026-09-05T09:00:00.000Z", status: "scheduled" },
          ],
        },
        locale,
      );
      assertBilingual(html, locale);
      expect(html).toContain("Oocyte retrieval");
      expect(html).toContain("Theatre-1");
      expect(html).toContain("2026-09-05");
    });
  }
});

describe("pullListPrint", () => {
  for (const locale of LOCALES) {
    it(`renders the pull list with out/home status (${locale})`, () => {
      const html = pullListPrint(
        {
          clinicName: CLINIC,
          date: "2026-09-10",
          rows: [
            { mrn: "OM-2026-00042", patientName: PATIENT, volume: 1, currentLocation: "Records/A-1", alreadyOut: false },
            { mrn: "OM-2026-00043", patientName: { en: "Sara Al-Ali", ar: "سارة العلي" }, volume: 2, currentLocation: "L3/Consult-1", alreadyOut: true },
          ],
        },
        locale,
      );
      assertBilingual(html, locale);
      expect(html).toContain("OM-2026-00042");
      expect(html).toContain("Records/A-1");
      // both status branches rendered
      expect(html).toContain(locale === "ar" ? "مُخرَج" : "Already out");
      expect(html).toContain(locale === "ar" ? "في الأرشيف" : "In records");
    });
  }
});

describe("HTML escaping", () => {
  it("escapes < > & \" ' in every rendered field", () => {
    const html = prescriptionPrint(
      {
        clinicName: CLINIC,
        patientName: { en: `A & <B> "C" 'D'`, ar: "ه" },
        mrn: "OM-1",
        prescriber: "Dr <X> & 'Y'",
        issuedAt: "2026-07-03T09:00:00.000Z",
        items: [{ name: { en: "Drug", ar: "دواء" }, quantity: 1, dose: { en: "x", ar: "س" } }],
      },
      "en",
    );
    expect(html).toContain("A &amp; &lt;B&gt; &quot;C&quot; &#39;D&#39;");
    expect(html).toContain("Dr &lt;X&gt; &amp; &#39;Y&#39;");
  });
});

describe("fmtDateTime robustness", () => {
  it("passes through an unparseable date rather than throwing", () => {
    const html = receiptPrint(
      {
        clinicName: CLINIC,
        receiptNo: "RCPT-X",
        issuedAt: "not-a-date",
        patientName: PATIENT,
        mrn: "OM-1",
        lines: [{ description: { en: "X", ar: "س" }, quantity: 1, unitAmountFils: 1000, lineTotalFils: 1000 }],
        totalFils: 1000,
        paidFils: 0,
        balanceFils: 1000,
        payment: null,
      },
      "en",
    );
    expect(html).toContain("not-a-date");
  });
});
