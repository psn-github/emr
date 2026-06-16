import type { OrderSet } from "./types.js";

// Clinical pathways / order sets (versioned config — docs/01 §E13 P1, CLAUDE.md
// "configuration is data"). Editable by authorised users without code changes;
// bilingual. Applying a set places all its constituent orders on an encounter.

export const SEED_ORDER_SETS: readonly OrderSet[] = [
  {
    id: "early_pregnancy",
    name: { ar: "حزمة الحمل المبكر", en: "Early pregnancy" },
    active: true,
    items: [
      { kind: "lab", code: "BHCG", label: { ar: "هرمون الحمل الكمي", en: "Quantitative β-hCG" } },
      { kind: "lab", code: "PROG", label: { ar: "البروجستيرون", en: "Progesterone" } },
      { kind: "imaging", code: "US_EARLY_VIABILITY", label: { ar: "سونار حيوية مبكرة", en: "Early viability ultrasound" } },
    ],
  },
  {
    id: "recurrent_miscarriage_workup",
    name: { ar: "تقييم الإجهاض المتكرر", en: "Recurrent miscarriage workup" },
    active: true,
    items: [
      { kind: "lab", code: "THROMBOPHILIA", label: { ar: "فحص التخثر", en: "Thrombophilia screen" } },
      { kind: "lab", code: "TSH", label: { ar: "هرمون الغدة الدرقية", en: "TSH" } },
      { kind: "lab", code: "APL_AB", label: { ar: "الأجسام المضادة للفوسفوليبيد", en: "Antiphospholipid antibodies" } },
      { kind: "referral", code: "GENETICS_KARYOTYPE", label: { ar: "إحالة وراثية - النمط النووي", en: "Genetics referral — karyotype" } },
    ],
  },
];

/** Lookup surface for order sets (own-module config). */
export interface OrderSetStore {
  get(id: string): Promise<OrderSet | null>;
  listActive(): Promise<readonly OrderSet[]>;
}

/** In-memory order-set store seeded from a set (defaults to the seed list). */
export class InMemoryOrderSetStore implements OrderSetStore {
  private readonly byId: Map<string, OrderSet>;
  constructor(sets: readonly OrderSet[] = SEED_ORDER_SETS) {
    this.byId = new Map(sets.map((s) => [s.id, s]));
  }
  async get(id: string): Promise<OrderSet | null> {
    return this.byId.get(id) ?? null;
  }
  async listActive(): Promise<readonly OrderSet[]> {
    return [...this.byId.values()].filter((s) => s.active);
  }
}
