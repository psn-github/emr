// @oxford/print — pure, deterministic bilingual print renderers (ADR-0068).
// Each artefact is a pure function from a plain read model to print-ready HTML
// (A4 / receipt CSS, RTL-correct en + ar). No service deps, no I/O, no PDF lib.
export type { PrintLocale, BilingualText } from "./print.js";
export {
  formatFilsKwd,
  DEFAULT_CLINIC_NAME,
  prescriptionPrint,
  type PrescriptionData,
  type PrescriptionPrintItem,
  receiptPrint,
  type ReceiptData,
  type ReceiptLine,
  type ReceiptPaymentMethod,
  appointmentSlipPrint,
  type AppointmentSlipData,
  clinicalLetterPrint,
  type ClinicalLetterData,
  theatreListPrint,
  type TheatreListData,
  type TheatreListCase,
  pullListPrint,
  type PullListData,
  type PullListRowData,
} from "./print.js";
