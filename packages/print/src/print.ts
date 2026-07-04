// Pure, deterministic bilingual print renderers (ADR-0068). Each artefact is a
// pure function from a plain read model to a full print-ready HTML string —
// A4 / receipt CSS, RTL-correct en + ar. No service dependencies, no I/O, no PDF
// library (browsers print the HTML). The `@oxford/records` label renderer is the
// pattern (bilingual spans, escapeHtml, htmlDoc). Held to 100% coverage and
// snapshot/content-tested in both locales.

export type PrintLocale = "en" | "ar";

export interface BilingualText {
  readonly en: string;
  readonly ar: string;
}

// ── shared HTML helpers ──────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => {
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    if (c === "&") return "&amp;";
    if (c === '"') return "&quot;";
    return "&#39;";
  });
}

const BASE_CSS =
  "*{box-sizing:border-box}" +
  "body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111}" +
  ".en{unicode-bidi:isolate}.ar{unicode-bidi:isolate}" +
  "table{border-collapse:collapse;width:100%}" +
  "th,td{border:0.2mm solid #999;padding:2mm;text-align:start;font-size:10pt}" +
  ".muted{color:#555;font-size:9pt}" +
  ".row{display:flex;justify-content:space-between;gap:4mm}" +
  ".num{font-variant-numeric:tabular-nums;white-space:nowrap}";

/** Full HTML document. `locale` sets the primary lang/dir; content stays bilingual. */
function htmlDoc(title: string, css: string, body: string, locale: PrintLocale): string {
  const dir = locale === "ar" ? "rtl" : "ltr";
  return (
    `<!DOCTYPE html><html lang="${locale}" dir="${dir}"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(title)}</title><style>${BASE_CSS}${css}</style></head>` +
    `<body>${body}</body></html>`
  );
}

/** English (LTR) + Arabic (RTL) spans, primary language first per `locale`. */
function bilingual(t: BilingualText, locale: PrintLocale): string {
  const en = `<span class="en" dir="ltr" lang="en">${escapeHtml(t.en)}</span>`;
  const ar = `<span class="ar" dir="rtl" lang="ar">${escapeHtml(t.ar)}</span>`;
  return locale === "ar" ? `${ar} / ${en}` : `${en} / ${ar}`;
}

/** A labelled field: bilingual label + a value. */
function field(label: BilingualText, value: string, locale: PrintLocale): string {
  return `<div class="row"><span>${bilingual(label, locale)}</span><span class="num">${escapeHtml(value)}</span></div>`;
}

/** Integer fils → a KWD string with 3 decimals (1 KWD = 1000 fils). Display only. */
export function formatFilsKwd(fils: number): string {
  const sign = fils < 0 ? "-" : "";
  const abs = Math.abs(fils);
  const dinars = Math.floor(abs / 1000);
  const rem = (abs % 1000).toString().padStart(3, "0");
  return `${sign}${dinars}.${rem} KWD`;
}

/** ISO instant → a stable YYYY-MM-DD HH:mm (UTC) string; date-only when asked. */
function fmtDateTime(iso: string, dateOnly = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toISOString().slice(0, 10);
  return dateOnly ? date : `${date} ${d.toISOString().slice(11, 16)}`;
}

const CLINIC = { en: "Clinic", ar: "العيادة" };
const heading = (t: BilingualText, locale: PrintLocale): string =>
  `<h1 style="font-size:14pt;margin:0 0 3mm">${bilingual(t, locale)}</h1>`;
const clinicHeader = (name: BilingualText, locale: PrintLocale): string =>
  `<div style="font-size:12pt;font-weight:bold;margin-bottom:2mm">${bilingual(name, locale)}</div>`;

// ── prescription (A4) ────────────────────────────────────────────────────────

export interface PrescriptionPrintItem {
  readonly name: BilingualText;
  readonly quantity: number;
  readonly dose: BilingualText;
}
export interface PrescriptionData {
  readonly clinicName: BilingualText;
  readonly patientName: BilingualText;
  readonly mrn: string;
  readonly prescriber: string;
  readonly issuedAt: string;
  readonly items: readonly PrescriptionPrintItem[];
}

const A4_CSS = "@page{size:A4;margin:14mm}.doc{max-width:182mm}";

export function prescriptionPrint(data: PrescriptionData, locale: PrintLocale): string {
  const rows = data.items
    .map(
      (it) =>
        `<tr><td>${bilingual(it.name, locale)}</td>` +
        `<td class="num">${it.quantity}</td>` +
        `<td>${bilingual(it.dose, locale)}</td></tr>`,
    )
    .join("");
  const body =
    `<div class="doc">` +
    clinicHeader(data.clinicName, locale) +
    heading({ en: "Prescription", ar: "وصفة طبية" }, locale) +
    `<div class="row"><span>${bilingual({ en: "Patient", ar: "المريض" }, locale)}</span><span>${bilingual(data.patientName, locale)}</span></div>` +
    field({ en: "MRN", ar: "رقم الملف" }, data.mrn, locale) +
    field({ en: "Date", ar: "التاريخ" }, fmtDateTime(data.issuedAt, true), locale) +
    `<table><thead><tr>` +
    `<th>${bilingual({ en: "Medication", ar: "الدواء" }, locale)}</th>` +
    `<th>${bilingual({ en: "Qty", ar: "الكمية" }, locale)}</th>` +
    `<th>${bilingual({ en: "Directions", ar: "التعليمات" }, locale)}</th>` +
    `</tr></thead><tbody>${rows}</tbody></table>` +
    `<div class="muted" style="margin-top:6mm">${bilingual({ en: "Prescriber", ar: "الطبيب" }, locale)}: ${escapeHtml(data.prescriber)}</div>` +
    `</div>`;
  return htmlDoc("Prescription", A4_CSS, body, locale);
}

// ── receipt (narrow) ─────────────────────────────────────────────────────────
// NO cash (ADR-0034) and NO tax (ADR-0035) are STRUCTURAL here: the payment
// method type is knet|card only and there is no tax field anywhere in the input.

export type ReceiptPaymentMethod = "knet" | "card";
export interface ReceiptLine {
  readonly description: BilingualText;
  readonly quantity: number;
  readonly unitAmountFils: number;
  readonly lineTotalFils: number;
}
export interface ReceiptData {
  readonly clinicName: BilingualText;
  readonly receiptNo: string;
  readonly issuedAt: string;
  readonly patientName: BilingualText;
  readonly mrn: string;
  readonly lines: readonly ReceiptLine[];
  readonly totalFils: number;
  readonly paidFils: number;
  readonly balanceFils: number;
  readonly payment: { readonly method: ReceiptPaymentMethod; readonly amountFils: number } | null;
}

const RECEIPT_CSS =
  "@page{size:80mm auto;margin:4mm}.receipt{width:72mm}" +
  ".receipt table th,.receipt table td{font-size:8pt;padding:1mm}" +
  ".receipt .tot{font-weight:bold;font-size:10pt;margin-top:2mm}";

const METHOD_LABEL: Record<ReceiptPaymentMethod, BilingualText> = {
  knet: { en: "KNET", ar: "كي نت" },
  card: { en: "Card", ar: "بطاقة" },
};

export function receiptPrint(data: ReceiptData, locale: PrintLocale): string {
  const rows = data.lines
    .map(
      (l) =>
        `<tr><td>${bilingual(l.description, locale)}</td>` +
        `<td class="num">${l.quantity}</td>` +
        `<td class="num">${formatFilsKwd(l.lineTotalFils)}</td></tr>`,
    )
    .join("");
  const paymentBlock =
    data.payment === null
      ? `<div class="muted">${bilingual({ en: "Unpaid", ar: "غير مدفوع" }, locale)}</div>`
      : field(
          { en: "Paid", ar: "المدفوع" },
          `${formatFilsKwd(data.payment.amountFils)} · ${bilingual(METHOD_LABEL[data.payment.method], locale)}`,
          locale,
        );
  const body =
    `<div class="receipt">` +
    clinicHeader(data.clinicName, locale) +
    heading({ en: "Receipt", ar: "إيصال" }, locale) +
    field({ en: "Receipt No", ar: "رقم الإيصال" }, data.receiptNo, locale) +
    field({ en: "Date", ar: "التاريخ" }, fmtDateTime(data.issuedAt), locale) +
    `<div class="row"><span>${bilingual({ en: "Patient", ar: "المريض" }, locale)}</span><span>${bilingual(data.patientName, locale)}</span></div>` +
    field({ en: "MRN", ar: "رقم الملف" }, data.mrn, locale) +
    `<table><tbody>${rows}</tbody></table>` +
    `<div class="tot">` +
    field({ en: "Total", ar: "الإجمالي" }, formatFilsKwd(data.totalFils), locale) +
    `</div>` +
    paymentBlock +
    field({ en: "Balance", ar: "المتبقي" }, formatFilsKwd(data.balanceFils), locale) +
    `</div>`;
  return htmlDoc(`Receipt ${data.receiptNo}`, RECEIPT_CSS, body, locale);
}

// ── appointment slip (small A6-ish) ──────────────────────────────────────────

export interface AppointmentSlipData {
  readonly clinicName: BilingualText;
  readonly patientName: BilingualText;
  readonly mrn: string;
  readonly appointmentType: BilingualText;
  readonly practitioner: BilingualText;
  readonly start: string;
  readonly location?: string;
  readonly prep?: BilingualText;
}

const SLIP_CSS = "@page{size:A6;margin:8mm}.slip{max-width:120mm}";

export function appointmentSlipPrint(data: AppointmentSlipData, locale: PrintLocale): string {
  const prep =
    data.prep !== undefined
      ? `<div class="muted" style="margin-top:3mm">${bilingual({ en: "Preparation", ar: "التحضير" }, locale)}: ${bilingual(data.prep, locale)}</div>`
      : "";
  const location =
    data.location !== undefined ? field({ en: "Location", ar: "المكان" }, data.location, locale) : "";
  const body =
    `<div class="slip">` +
    clinicHeader(data.clinicName, locale) +
    heading({ en: "Appointment", ar: "موعد" }, locale) +
    `<div class="row"><span>${bilingual({ en: "Patient", ar: "المريض" }, locale)}</span><span>${bilingual(data.patientName, locale)}</span></div>` +
    field({ en: "MRN", ar: "رقم الملف" }, data.mrn, locale) +
    `<div class="row"><span>${bilingual({ en: "Type", ar: "النوع" }, locale)}</span><span>${bilingual(data.appointmentType, locale)}</span></div>` +
    `<div class="row"><span>${bilingual({ en: "With", ar: "مع" }, locale)}</span><span>${bilingual(data.practitioner, locale)}</span></div>` +
    field({ en: "When", ar: "الوقت" }, fmtDateTime(data.start), locale) +
    location +
    prep +
    `</div>`;
  return htmlDoc("Appointment", SLIP_CSS, body, locale);
}

// ── clinical letter (A4, letterhead) ─────────────────────────────────────────

export interface ClinicalLetterData {
  readonly clinicName: BilingualText;
  readonly patientName: BilingualText;
  readonly mrn: string;
  readonly issuedAt: string;
  readonly reference: string;
  readonly paragraphs: readonly string[];
  readonly signatory: string;
}

export function clinicalLetterPrint(data: ClinicalLetterData, locale: PrintLocale): string {
  const paras = data.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  const body =
    `<div class="doc">` +
    clinicHeader(data.clinicName, locale) +
    `<div class="muted row"><span>${escapeHtml(data.reference)}</span><span>${escapeHtml(fmtDateTime(data.issuedAt, true))}</span></div>` +
    `<div class="row" style="margin:4mm 0"><span>${bilingual({ en: "Patient", ar: "المريض" }, locale)}: ${bilingual(data.patientName, locale)}</span><span>${bilingual({ en: "MRN", ar: "رقم الملف" }, locale)}: ${escapeHtml(data.mrn)}</span></div>` +
    `<div class="body" lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}">${paras}</div>` +
    `<div style="margin-top:10mm">${escapeHtml(data.signatory)}</div>` +
    `</div>`;
  return htmlDoc("Clinical Letter", A4_CSS, body, locale);
}

// ── theatre day list (A4 table) ──────────────────────────────────────────────

export interface TheatreListCase {
  readonly patientName: BilingualText;
  readonly mrn: string;
  readonly procedure: string;
  readonly theatre: string;
  readonly surgeon: string;
  readonly start: string;
  readonly end: string;
  readonly status: string;
}
export interface TheatreListData {
  readonly clinicName: BilingualText;
  readonly date: string;
  readonly cases: readonly TheatreListCase[];
}

export function theatreListPrint(data: TheatreListData, locale: PrintLocale): string {
  const rows = data.cases
    .map(
      (c) =>
        `<tr><td class="num">${escapeHtml(fmtDateTime(c.start))}–${escapeHtml(fmtDateTime(c.end).slice(11))}</td>` +
        `<td>${bilingual(c.patientName, locale)}<div class="muted num">${escapeHtml(c.mrn)}</div></td>` +
        `<td>${escapeHtml(c.procedure)}</td>` +
        `<td>${escapeHtml(c.theatre)}</td>` +
        `<td>${escapeHtml(c.surgeon)}</td>` +
        `<td>${escapeHtml(c.status)}</td></tr>`,
    )
    .join("");
  const body =
    `<div class="doc">` +
    clinicHeader(data.clinicName, locale) +
    heading({ en: "Theatre List", ar: "قائمة العمليات" }, locale) +
    field({ en: "Date", ar: "التاريخ" }, data.date, locale) +
    `<table><thead><tr>` +
    [
      { en: "Time", ar: "الوقت" },
      { en: "Patient", ar: "المريض" },
      { en: "Procedure", ar: "العملية" },
      { en: "Theatre", ar: "غرفة العمليات" },
      { en: "Surgeon", ar: "الجراح" },
      { en: "Status", ar: "الحالة" },
    ]
      .map((h) => `<th>${bilingual(h, locale)}</th>`)
      .join("") +
    `</tr></thead><tbody>${rows}</tbody></table>` +
    `</div>`;
  return htmlDoc("Theatre List", A4_CSS, body, locale);
}

// ── records pull list (A4 table) ─────────────────────────────────────────────

export interface PullListRowData {
  readonly mrn: string;
  readonly patientName: BilingualText;
  readonly volume: number;
  readonly currentLocation: string;
  readonly alreadyOut: boolean;
}
export interface PullListData {
  readonly clinicName: BilingualText;
  readonly date: string;
  readonly rows: readonly PullListRowData[];
}

export function pullListPrint(data: PullListData, locale: PrintLocale): string {
  const out = { en: "Already out", ar: "مُخرَج" };
  const home = { en: "In records", ar: "في الأرشيف" };
  const rows = data.rows
    .map(
      (r) =>
        `<tr><td class="num">${escapeHtml(r.mrn)}</td>` +
        `<td>${bilingual(r.patientName, locale)}</td>` +
        `<td class="num">${r.volume}</td>` +
        `<td>${escapeHtml(r.currentLocation)}</td>` +
        `<td>${bilingual(r.alreadyOut ? out : home, locale)}</td></tr>`,
    )
    .join("");
  const body =
    `<div class="doc">` +
    clinicHeader(data.clinicName, locale) +
    heading({ en: "File Pull List", ar: "قائمة سحب الملفات" }, locale) +
    field({ en: "Date", ar: "التاريخ" }, data.date, locale) +
    `<table><thead><tr>` +
    [
      { en: "MRN", ar: "رقم الملف" },
      { en: "Patient", ar: "المريض" },
      { en: "Vol", ar: "مجلد" },
      { en: "Location", ar: "المكان" },
      { en: "Status", ar: "الحالة" },
    ]
      .map((h) => `<th>${bilingual(h, locale)}</th>`)
      .join("") +
    `</tr></thead><tbody>${rows}</tbody></table>` +
    `</div>`;
  return htmlDoc("Pull List", A4_CSS, body, locale);
}

export { CLINIC as DEFAULT_CLINIC_NAME };
