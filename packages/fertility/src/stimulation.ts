import type { Id } from "@oxford/core";
import type { DrugDoseInput } from "./stim-validate.js";

// Stimulation chart: a day-by-day grid of formulary drug doses, follicle
// measurements per ovary, endometrial thickness, and endocrine values — with
// trend (docs/01 §E3). Dosing is clinician-entered + validated here; the
// om-software dosing calculator is ported as a follow-on.

export type StimulationDayId = Id<"StimulationDay">;

export interface FollicleMeasurement {
  readonly ovary: "left" | "right";
  /** Follicle diameters in mm. */
  readonly sizesMm: readonly number[];
}

export interface Endocrine {
  readonly e2?: number;
  readonly lh?: number;
  readonly p4?: number;
  readonly fsh?: number;
}

export interface StimulationDay {
  readonly id: StimulationDayId;
  readonly cycleId: string;
  /** Stimulation day number (1-based). */
  readonly day: number;
  readonly drugs: readonly DrugDoseInput[];
  readonly follicles: readonly FollicleMeasurement[];
  readonly endometriumMm: number | null;
  readonly endocrine: Endocrine;
  readonly recordedBy: string;
  readonly at: string;
}

export interface RecordDayInput {
  readonly day: number;
  readonly drugs: readonly DrugDoseInput[];
  readonly follicles?: readonly FollicleMeasurement[];
  readonly endometriumMm?: number;
  readonly endocrine?: Endocrine;
}
