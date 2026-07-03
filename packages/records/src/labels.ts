// Pure, deterministic label renderers (ADR-0065). Bilingual (en + ar, dir-correct)
// print-ready HTML with print CSS, and plain ZPL strings (Code 128 via ^BC) for
// Zebra-class thermal printers. Three templates: file spine, patient ID label
// sheet (A4, repeated), and a single thermal label. PHI is minimised — labels
// carry the MRN, names and DOB, but NEVER the civil ID (ADR-0065). No I/O; held
// to 100% coverage and snapshot-tested in both locales.
import { code128Svg } from "./code128.js";

export interface LabelPatient {
  /** Allocated or imported MRN (the barcode payload). */
  readonly mrn: string;
  readonly nameEn: string;
  readonly nameAr: string;
  /** Date of birth (ISO date) — printed on ID labels; omitted elsewhere. */
  readonly dob?: string;
  /** Physical file volume (spine labels). Defaults to 1. */
  readonly volume?: number;
}

export interface IdSheetOptions {
  /** Number of identical labels on the sheet. Default 24 (a 3×8 A4 grid). */
  readonly count?: number;
  /** Columns in the grid. Default 3. */
  readonly columns?: number;
}

const SPINE_CSS =
  "@page{size:105mm 35mm;margin:0}" +
  "*{box-sizing:border-box}" +
  "body{margin:0;font-family:Arial,Helvetica,sans-serif}" +
  ".spine{width:105mm;height:35mm;padding:3mm;border:0.3mm solid #000;display:flex;flex-direction:column;justify-content:space-between}" +
  ".spine .mrn{font-size:14pt;font-weight:bold;letter-spacing:1px}" +
  ".spine .names{display:flex;justify-content:space-between;font-size:11pt}" +
  ".spine .vol{font-size:10pt;color:#333}";

const SHEET_CSS =
  "@page{size:A4;margin:8mm}" +
  "*{box-sizing:border-box}" +
  "body{margin:0;font-family:Arial,Helvetica,sans-serif}" +
  ".sheet{display:grid;gap:2mm}" +
  ".idlabel{border:0.2mm dashed #999;padding:2mm;height:34mm;display:flex;flex-direction:column;justify-content:center;gap:1mm}" +
  ".idlabel .mrn{font-size:12pt;font-weight:bold}" +
  ".idlabel .name{font-size:11pt}" +
  ".idlabel .dob{font-size:9pt;color:#333}";

const THERMAL_CSS =
  "@page{size:50mm 25mm;margin:0}" +
  "*{box-sizing:border-box}" +
  "body{margin:0;font-family:Arial,Helvetica,sans-serif}" +
  ".thermal{width:50mm;height:25mm;padding:1.5mm;display:flex;flex-direction:column;justify-content:space-between;align-items:center}" +
  ".thermal .mrn{font-size:9pt;font-weight:bold}" +
  ".thermal .name{font-size:8pt}";

/** English span (LTR) followed by an Arabic span (RTL) — dir handled explicitly. */
function bilingualName(nameEn: string, nameAr: string): string {
  return (
    `<span class="en" dir="ltr" lang="en">${escapeHtml(nameEn)}</span>` +
    `<span class="ar" dir="rtl" lang="ar">${escapeHtml(nameAr)}</span>`
  );
}

function htmlDoc(title: string, css: string, body: string): string {
  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(title)}</title><style>${css}</style></head>` +
    `<body>${body}</body></html>`
  );
}

/** File spine label: MRN barcode + MRN text + bilingual name + volume. */
export function fileSpineLabel(p: LabelPatient): string {
  const volume = p.volume ?? 1;
  const barcode = code128Svg(p.mrn, { moduleWidth: 2, height: 40, showText: false });
  const body =
    `<div class="spine">` +
    `<div class="mrn">${escapeHtml(p.mrn)}</div>` +
    `<div class="barcode">${barcode}</div>` +
    `<div class="names">${bilingualName(p.nameEn, p.nameAr)}</div>` +
    `<div class="vol">Volume / المجلد: ${volume}</div>` +
    `</div>`;
  return htmlDoc(`File ${p.mrn}`, SPINE_CSS, body);
}

/** A4 sheet of repeated patient ID labels (name en/ar, MRN, DOB — no civil ID). */
export function patientIdLabelSheet(p: LabelPatient, options: IdSheetOptions = {}): string {
  const count = options.count ?? 24;
  const columns = options.columns ?? 3;
  const one =
    `<div class="idlabel">` +
    `<div class="mrn">${escapeHtml(p.mrn)}</div>` +
    `<div class="name">${bilingualName(p.nameEn, p.nameAr)}</div>` +
    (p.dob !== undefined ? `<div class="dob">DOB / تاريخ الميلاد: ${escapeHtml(p.dob)}</div>` : "") +
    `</div>`;
  const labels = one.repeat(count);
  const body = `<div class="sheet" style="grid-template-columns:repeat(${columns},1fr)">${labels}</div>`;
  return htmlDoc(`ID labels ${p.mrn}`, SHEET_CSS, body);
}

/** Single 50×25mm thermal label: compact MRN barcode + MRN + bilingual name. */
export function thermalLabel(p: LabelPatient): string {
  const barcode = code128Svg(p.mrn, { moduleWidth: 1, height: 24, showText: false });
  const body =
    `<div class="thermal">` +
    `<div class="mrn">${escapeHtml(p.mrn)}</div>` +
    `<div class="barcode">${barcode}</div>` +
    `<div class="name">${bilingualName(p.nameEn, p.nameAr)}</div>` +
    `</div>`;
  return htmlDoc(`Label ${p.mrn}`, THERMAL_CSS, body);
}

// ── ZPL renderers (Code 128 via ^BC; ^CI28 selects UTF-8 for Arabic text) ─────

/** File spine label as ZPL. */
export function fileSpineZpl(p: LabelPatient): string {
  const volume = p.volume ?? 1;
  return [
    "^XA",
    "^CI28",
    "^FO30,20^A0N,28,28^FD" + zpl(p.mrn) + "^FS",
    "^FO30,60^BY2^BCN,90,N,N,N^FD" + zpl(p.mrn) + "^FS",
    "^FO30,170^A0N,24,24^FD" + zpl(p.nameEn) + "^FS",
    "^FO30,200^A0N,24,24^FD" + zpl(p.nameAr) + "^FS",
    "^FO30,232^A0N,20,20^FDVol " + volume + "^FS",
    "^XZ",
  ].join("\n");
}

/** Patient ID label sheet as ZPL — `count` copies via the ^PQ quantity field. */
export function patientIdSheetZpl(p: LabelPatient, options: IdSheetOptions = {}): string {
  const count = options.count ?? 24;
  const dob = p.dob !== undefined ? "^FO30,150^A0N,20,20^FDDOB " + zpl(p.dob) + "^FS\n" : "";
  return [
    "^XA",
    "^CI28",
    "^FO30,20^A0N,28,28^FD" + zpl(p.mrn) + "^FS",
    "^FO30,60^A0N,24,24^FD" + zpl(p.nameEn) + "^FS",
    "^FO30,90^A0N,24,24^FD" + zpl(p.nameAr) + "^FS",
    dob + "^PQ" + count + ",0,0,Y",
    "^XZ",
  ].join("\n");
}

/** Single thermal label as ZPL. */
export function thermalZpl(p: LabelPatient): string {
  return [
    "^XA",
    "^CI28",
    "^FO20,10^A0N,22,22^FD" + zpl(p.mrn) + "^FS",
    "^FO20,40^BY1^BCN,60,N,N,N^FD" + zpl(p.mrn) + "^FS",
    "^FO20,120^A0N,20,20^FD" + zpl(p.nameEn) + "^FS",
    "^FO20,148^A0N,20,20^FD" + zpl(p.nameAr) + "^FS",
    "^XZ",
  ].join("\n");
}

/** ZPL field-data escaping for the caret/tilde/paren control characters. */
function zpl(s: string): string {
  return s.replace(/([\^~])/g, " ");
}

function escapeHtml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => {
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    if (c === "&") return "&amp;";
    if (c === '"') return "&quot;";
    return "&#39;";
  });
}
