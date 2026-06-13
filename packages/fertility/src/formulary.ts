// Controlled stimulation-drug formulary (CLAUDE.md hard rule: prescribable items
// come from a formulary table, never free text). Seed of the stimulation drugs
// used at the clinic; the full pharmacy formulary (Phase 4) supersedes/merges
// this. Bilingual names; a fixed unit per item.

export type DrugClass =
  | "gonadotropin_fsh"
  | "gonadotropin_hmg"
  | "gnrh_agonist"
  | "gnrh_antagonist"
  | "trigger"
  | "progesterone"
  | "estrogen"
  | "anticoagulant";

export type DoseUnit = "IU" | "mg" | "mcg";

export interface FormularyItem {
  readonly id: string;
  readonly name: { readonly ar: string; readonly en: string };
  readonly drugClass: DrugClass;
  readonly unit: DoseUnit;
}

export const STIM_FORMULARY: readonly FormularyItem[] = [
  { id: "rfsh", name: { ar: "هرمون منبه للجريب", en: "Recombinant FSH" }, drugClass: "gonadotropin_fsh", unit: "IU" },
  { id: "hp_hmg", name: { ar: "هرمون مينوبور", en: "HP-hMG" }, drugClass: "gonadotropin_hmg", unit: "IU" },
  { id: "gnrh_antagonist", name: { ar: "مضاد GnRH", en: "GnRH antagonist" }, drugClass: "gnrh_antagonist", unit: "mg" },
  { id: "gnrh_agonist", name: { ar: "ناهض GnRH", en: "GnRH agonist" }, drugClass: "gnrh_agonist", unit: "mg" },
  { id: "hcg_trigger", name: { ar: "إبرة التفجير hCG", en: "hCG trigger" }, drugClass: "trigger", unit: "mcg" },
  { id: "progesterone", name: { ar: "بروجستيرون", en: "Progesterone" }, drugClass: "progesterone", unit: "mg" },
];

const BY_ID = new Map(STIM_FORMULARY.map((i) => [i.id, i]));

export function formularyItem(id: string): FormularyItem | null {
  return BY_ID.get(id) ?? null;
}
