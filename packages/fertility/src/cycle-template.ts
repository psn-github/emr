import type { CycleType } from "./types.js";

// Cycle templates (versioned config — docs/01 §E3 P1, CLAUDE.md "configuration is
// data"). A template captures a consultant's default cycle setup (type + protocol)
// so a cycle can be started in one step. Templates are per-consultant
// (`ownerStaffId`) or clinic-wide (`ownerStaffId === null`). Bilingual; editable
// by authorised users without code changes.

export interface CycleTemplate {
  readonly id: string;
  readonly name: { readonly ar: string; readonly en: string };
  readonly cycleType: CycleType;
  readonly protocolId: string | null;
  /** The consultant this template belongs to, or null for a clinic-wide template. */
  readonly ownerStaffId: string | null;
  readonly active: boolean;
}

export const SEED_CYCLE_TEMPLATES: readonly CycleTemplate[] = [
  { id: "antagonist_icsi", name: { ar: "حقن مجهري - بروتوكول مضاد", en: "Antagonist ICSI" }, cycleType: "icsi", protocolId: "antagonist", ownerStaffId: null, active: true },
  { id: "long_ivf", name: { ar: "أطفال أنابيب - البروتوكول الطويل", en: "Long-protocol IVF" }, cycleType: "ivf", protocolId: "long_agonist", ownerStaffId: null, active: true },
  { id: "natural_fet", name: { ar: "إرجاع أجنة مجمدة - دورة طبيعية", en: "Natural FET" }, cycleType: "fet", protocolId: "natural_fet", ownerStaffId: null, active: true },
  { id: "mild_preservation", name: { ar: "حفظ الخصوبة - تحفيز خفيف", en: "Mild preservation" }, cycleType: "fertility_preservation", protocolId: "mild", ownerStaffId: null, active: true },
];

/** Lookup surface for cycle templates (own-module config). */
export interface CycleTemplateStore {
  get(id: string): Promise<CycleTemplate | null>;
  /** Active templates available to a consultant: their own + clinic-wide (shared). */
  listFor(staffId: string): Promise<readonly CycleTemplate[]>;
}

/** In-memory template store seeded from a set (defaults to the seed list). */
export class InMemoryCycleTemplateStore implements CycleTemplateStore {
  private readonly byId: Map<string, CycleTemplate>;
  constructor(templates: readonly CycleTemplate[] = SEED_CYCLE_TEMPLATES) {
    this.byId = new Map(templates.map((t) => [t.id, t]));
  }
  async get(id: string): Promise<CycleTemplate | null> {
    return this.byId.get(id) ?? null;
  }
  async listFor(staffId: string): Promise<readonly CycleTemplate[]> {
    return [...this.byId.values()].filter((t) => t.active && (t.ownerStaffId === null || t.ownerStaffId === staffId));
  }
}
