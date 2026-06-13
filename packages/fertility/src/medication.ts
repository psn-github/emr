import type { StimulationDay } from "./stimulation.js";
import { formularyItem, type DoseUnit } from "./formulary.js";

// Patient-facing medication schedule + injection-teaching media (docs/01 §E13,
// §E8 P1). Pure: enriches the stimulation chart with bilingual drug names and a
// teaching-video reference per drug. The teaching map is configuration. 100%.

/** Drug id → injection-teaching video reference (config; defaults for the seed
 *  stimulation formulary). The actual media lives in the document/media store. */
export const DEFAULT_INJECTION_TEACHING: Readonly<Record<string, string>> = {
  rfsh: "video:injection/rfsh",
  hp_hmg: "video:injection/hp_hmg",
  gnrh_antagonist: "video:injection/gnrh-antagonist",
  gnrh_agonist: "video:injection/gnrh-agonist",
  hcg_trigger: "video:injection/hcg-trigger",
  progesterone: "video:injection/progesterone",
};

export function injectionTeachingFor(drugId: string, map: Readonly<Record<string, string>> = DEFAULT_INJECTION_TEACHING): string | null {
  return map[drugId] ?? null;
}

export interface MedicationDrug {
  readonly formularyItemId: string;
  readonly name: { readonly ar: string; readonly en: string } | null;
  readonly dose: number;
  readonly unit: DoseUnit;
  readonly route: string | null;
  /** Injection-teaching video for this drug (null if none configured). */
  readonly teachingVideoRef: string | null;
}
export interface MedicationDay {
  readonly day: number;
  readonly drugs: readonly MedicationDrug[];
}

/** Build the patient medication schedule from the stimulation chart: each day's
 *  drugs enriched with the formulary name + an injection-teaching video. */
export function buildMedicationSchedule(days: readonly StimulationDay[], teaching: Readonly<Record<string, string>> = DEFAULT_INJECTION_TEACHING): readonly MedicationDay[] {
  return days.map((d) => ({
    day: d.day,
    drugs: d.drugs.map((dr) => ({
      formularyItemId: dr.formularyItemId,
      name: formularyItem(dr.formularyItemId)?.name ?? null,
      dose: dr.dose,
      unit: dr.unit,
      route: dr.route ?? null,
      teachingVideoRef: injectionTeachingFor(dr.formularyItemId, teaching),
    })),
  }));
}
