// AMH-nomogram decision support (docs/01 §E3 P2, line 97): AMH-informed
// counselling surfaced at point of care. Pure + ADVISORY — maps a patient's AMH
// (+ age) to an expected ovarian-response category, an expected oocyte-yield band,
// and counselling flags. It informs the conversation; it never selects a protocol,
// dose, or decision. The bands are CONFIGURATION (clinic-tunable). 100% covered.

export type OvarianResponseCategory = "poor" | "reduced" | "normal" | "high";

export interface AmhBand {
  readonly category: OvarianResponseCategory;
  /** Inclusive lower AMH bound (ng/mL) for this band. */
  readonly amhMinNgMl: number;
  readonly expectedOocyteRange: { readonly min: number; readonly max: number };
}

/** Default AMH bands (ng/mL), descending — common counselling cut-offs; clinic-tunable. */
export const DEFAULT_AMH_BANDS: readonly AmhBand[] = [
  { category: "high", amhMinNgMl: 3.5, expectedOocyteRange: { min: 15, max: 25 } },
  { category: "normal", amhMinNgMl: 2.2, expectedOocyteRange: { min: 8, max: 14 } },
  { category: "reduced", amhMinNgMl: 1.0, expectedOocyteRange: { min: 4, max: 7 } },
  { category: "poor", amhMinNgMl: 0, expectedOocyteRange: { min: 0, max: 3 } },
];

export interface AmhCounselling {
  readonly category: OvarianResponseCategory;
  readonly expectedOocyteRange: { readonly min: number; readonly max: number };
  readonly counsellingFlags: readonly string[];
}

/** Map AMH (ng/mL) + age to advisory counselling. Bands are descending; the
 *  poor band (amhMinNgMl 0) always matches a non-negative AMH. */
export function amhNomogram(amhNgMl: number, ageYears: number, bands: readonly AmhBand[] = DEFAULT_AMH_BANDS): AmhCounselling {
  const band = bands.find((b) => amhNgMl >= b.amhMinNgMl)!;
  const counsellingFlags: string[] = [];
  if (band.category === "high") counsellingFlags.push("ohss_precaution");
  if (band.category === "poor") counsellingFlags.push("low_prognosis_counselling");
  if (ageYears >= 40) counsellingFlags.push("advanced_maternal_age_counselling");
  return { category: band.category, expectedOocyteRange: band.expectedOocyteRange, counsellingFlags };
}
