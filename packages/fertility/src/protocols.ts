import type { Protocol } from "./types.js";

// Seed stimulation protocols (config — docs/01 §E3). Default drug regimens (incl.
// follitropin-delta dosing) are attached in PR 2.2. Editable by authorised users
// without code changes (configuration is data).
export const SEED_PROTOCOLS: readonly Protocol[] = [
  { id: "antagonist", name: { ar: "بروتوكول المضاد", en: "Antagonist" }, appliesTo: ["ivf", "icsi"] },
  { id: "long_agonist", name: { ar: "البروتوكول الطويل", en: "Long agonist" }, appliesTo: ["ivf", "icsi"] },
  { id: "mild", name: { ar: "التحفيز الخفيف", en: "Mild stimulation" }, appliesTo: ["ivf", "icsi", "fertility_preservation"] },
  { id: "ppos", name: { ar: "بروتوكول PPOS", en: "PPOS" }, appliesTo: ["ivf", "icsi", "fertility_preservation"] },
  { id: "natural_fet", name: { ar: "إرجاع طبيعي", en: "Natural FET" }, appliesTo: ["fet"] },
];
