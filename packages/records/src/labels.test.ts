import { describe, expect, it } from "vitest";
import {
  fileSpineLabel,
  patientIdLabelSheet,
  thermalLabel,
  fileSpineZpl,
  patientIdSheetZpl,
  thermalZpl,
  type LabelPatient,
} from "./labels.js";

const PATIENT: LabelPatient = { mrn: "OM-2026-00042", nameEn: "Sara Al-Ali", nameAr: "سارة العلي", dob: "1990-05-01", volume: 2 };
const CIVIL_ID = "290050112345"; // must NEVER appear on a label (PHI minimisation)

describe("HTML labels (bilingual, dir-correct, PHI-minimised)", () => {
  it("fileSpineLabel: barcode + MRN + en/ar names + volume", () => {
    const html = fileSpineLabel(PATIENT);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<svg"); // barcode
    expect(html).toContain("OM-2026-00042");
    expect(html).toContain('dir="ltr" lang="en">Sara Al-Ali');
    expect(html).toContain('dir="rtl" lang="ar">سارة العلي');
    expect(html).toContain("Volume / المجلد: 2");
    expect(html).not.toContain(CIVIL_ID);
  });

  it("fileSpineLabel: volume defaults to 1", () => {
    const html = fileSpineLabel({ mrn: "OM-2026-00001", nameEn: "A", nameAr: "أ" });
    expect(html).toContain("Volume / المجلد: 1");
  });

  it("patientIdLabelSheet: repeats the label, includes DOB, no civil ID", () => {
    const html = patientIdLabelSheet(PATIENT, { count: 6, columns: 2 });
    expect((html.match(/class="idlabel"/g) ?? []).length).toBe(6);
    expect(html).toContain("grid-template-columns:repeat(2,1fr)");
    expect(html).toContain("DOB / تاريخ الميلاد: 1990-05-01");
    expect(html).toContain("سارة العلي");
    expect(html).not.toContain(CIVIL_ID);
  });

  it("patientIdLabelSheet: defaults (24 labels, 3 columns) and omits DOB when absent", () => {
    const html = patientIdLabelSheet({ mrn: "OM-2026-00002", nameEn: "B", nameAr: "ب" });
    expect((html.match(/class="idlabel"/g) ?? []).length).toBe(24);
    expect(html).toContain("grid-template-columns:repeat(3,1fr)");
    expect(html).not.toContain("DOB /");
  });

  it("thermalLabel: compact single label with barcode + names", () => {
    const html = thermalLabel(PATIENT);
    expect(html).toContain("<svg");
    expect(html).toContain("OM-2026-00042");
    expect(html).toContain("سارة العلي");
    expect(html).not.toContain(CIVIL_ID);
  });

  it("escapes HTML specials in names (< > & \" ')", () => {
    const html = fileSpineLabel({ mrn: "OM-2026-00003", nameEn: "A & <B> 'x'", nameAr: "\"ج\"" });
    expect(html).toContain("A &amp; &lt;B&gt; &#39;x&#39;");
    expect(html).toContain("&quot;ج&quot;");
  });
});

describe("ZPL labels (Code 128 via ^BC, UTF-8 via ^CI28)", () => {
  it("fileSpineZpl is exact and bilingual", () => {
    expect(fileSpineZpl(PATIENT)).toBe(
      [
        "^XA",
        "^CI28",
        "^FO30,20^A0N,28,28^FDOM-2026-00042^FS",
        "^FO30,60^BY2^BCN,90,N,N,N^FDOM-2026-00042^FS",
        "^FO30,170^A0N,24,24^FDSara Al-Ali^FS",
        "^FO30,200^A0N,24,24^FDسارة العلي^FS",
        "^FO30,232^A0N,20,20^FDVol 2^FS",
        "^XZ",
      ].join("\n"),
    );
  });

  it("patientIdSheetZpl carries ^PQ quantity + DOB, and drops DOB when absent", () => {
    const withDob = patientIdSheetZpl(PATIENT, { count: 10 });
    expect(withDob).toContain("^CI28");
    expect(withDob).toContain("^FDDOB 1990-05-01^FS");
    expect(withDob).toContain("^PQ10,0,0,Y");
    expect(withDob).toContain("^FDسارة العلي^FS");

    const noDob = patientIdSheetZpl({ mrn: "OM-2026-00004", nameEn: "C", nameAr: "ج" });
    expect(noDob).not.toContain("DOB");
    expect(noDob).toContain("^PQ24,0,0,Y"); // default count
  });

  it("fileSpineZpl defaults the volume to 1", () => {
    expect(fileSpineZpl({ mrn: "OM-2026-00006", nameEn: "F", nameAr: "و" })).toContain("^FDVol 1^FS");
  });

  it("thermalZpl is exact", () => {
    expect(thermalZpl({ mrn: "OM-2026-00005", nameEn: "D", nameAr: "د" })).toBe(
      [
        "^XA",
        "^CI28",
        "^FO20,10^A0N,22,22^FDOM-2026-00005^FS",
        "^FO20,40^BY1^BCN,60,N,N,N^FDOM-2026-00005^FS",
        "^FO20,120^A0N,20,20^FDD^FS",
        "^FO20,148^A0N,20,20^FDد^FS",
        "^XZ",
      ].join("\n"),
    );
  });

  it("neutralises ZPL control characters (^ ~) in field data", () => {
    const zpl = thermalZpl({ mrn: "OM^1~2", nameEn: "E^F", nameAr: "ه~و" });
    expect(zpl).toContain("^FDOM 1 2^FS");
    expect(zpl).toContain("^FDE F^FS");
    expect(zpl).toContain("^FDه و^FS");
  });
});
