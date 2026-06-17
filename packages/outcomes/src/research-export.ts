import { createHash } from "node:crypto";

// Research / registry export (docs/01 §E11 P2; "de-identifiable for research",
// line 229). De-identified BY CONSTRUCTION: the input type carries NO direct
// identifiers (no name, civil id, or DOB — only an age in years, which is reduced
// to a band), and ids are pseudonymised with a salted hash so a row cannot be
// linked back to a patient without the (secret, residency-controlled) salt.
// Shape follows ESHRE-style registry fields. Pure + 100% covered.

export type AgeBand = "<35" | "35-37" | "38-39" | "40-42" | ">42";

/** ESHRE-style maternal age bands (exact age never leaves the export). */
export function ageBand(years: number): AgeBand {
  if (years < 35) return "<35";
  if (years <= 37) return "35-37";
  if (years <= 39) return "38-39";
  if (years <= 42) return "40-42";
  return ">42";
}

/** Per-cycle facts for the export. No PHI: callers pass clinical counts + an age
 *  in years + pseudonymisable references only (never names/civil-id/DOB). */
export interface RegistryCycleInput {
  /** Pseudonymised in the output; never emitted raw. */
  readonly cycleId: string;
  /** Patient reference — pseudonymised in the output (links sibling cycles only). */
  readonly patientRef: string;
  readonly ageYears: number;
  readonly cycleType: string;
  readonly protocol: string;
  readonly oocytesRetrieved: number;
  readonly matureOocytes: number;
  readonly twoPnZygotes: number;
  readonly embryosTransferred: number;
  readonly biochemicalPregnancy: boolean;
  readonly clinicalPregnancy: boolean;
  readonly liveBirth: boolean;
  readonly liveBirthCount: number;
}

/** A de-identified registry row — hashed keys, banded age, clinical fields only. */
export interface RegistryRow {
  readonly cycleKey: string;
  readonly patientKey: string;
  readonly ageBand: AgeBand;
  readonly cycleType: string;
  readonly protocol: string;
  readonly oocytesRetrieved: number;
  readonly matureOocytes: number;
  readonly twoPnZygotes: number;
  readonly embryosTransferred: number;
  readonly biochemicalPregnancy: boolean;
  readonly clinicalPregnancy: boolean;
  readonly liveBirth: boolean;
  readonly liveBirthCount: number;
}

/** Stable, salted, non-reversible pseudonym for an identifier. */
function pseudonymise(value: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${value}`, "utf8").digest("hex").slice(0, 16);
}

/** De-identify + shape one cycle into a registry row (pure). */
export function toRegistryRow(input: RegistryCycleInput, salt: string): RegistryRow {
  return {
    cycleKey: pseudonymise(input.cycleId, salt),
    patientKey: pseudonymise(input.patientRef, salt),
    ageBand: ageBand(input.ageYears),
    cycleType: input.cycleType,
    protocol: input.protocol,
    oocytesRetrieved: input.oocytesRetrieved,
    matureOocytes: input.matureOocytes,
    twoPnZygotes: input.twoPnZygotes,
    embryosTransferred: input.embryosTransferred,
    biochemicalPregnancy: input.biochemicalPregnancy,
    clinicalPregnancy: input.clinicalPregnancy,
    liveBirth: input.liveBirth,
    liveBirthCount: input.liveBirthCount,
  };
}

/** Build the full de-identified registry export from per-cycle inputs. */
export function buildRegistryExport(inputs: readonly RegistryCycleInput[], salt: string): readonly RegistryRow[] {
  return inputs.map((i) => toRegistryRow(i, salt));
}
