import type { OxfordHandlingEvent, RiWitnessRecord } from "./types.js";

// The WitnessingProvider / RiWitnessProvider seam (CLAUDE.md). All contact with
// RI Witness is behind this adapter so the rest of the system never talks to a
// concrete vendor. ADR-0018: a deterministic stub stands in until the
// CooperSurgical/RI Witness integration is scoped; no real device, no PHI.

/** Demographics Oxford pushes OUT to RI Witness (Oxford is the master). */
export interface WitnessDemographics {
  readonly patientId: string;
  readonly cycleId: string;
}

export interface WitnessingProvider {
  /** Oxford is demographic master: push patient/cycle identifiers into RI. */
  pushDemographics(demographics: WitnessDemographics): Promise<void>;
  /** Consume witnessing/traceability back: the RI records for a cycle. */
  fetchRecordsForCycle(cycleId: string): Promise<readonly RiWitnessRecord[]>;
}

/**
 * In-memory RI Witness stub (ADR-0018). It records demographic pushes and
 * returns seeded RI records. Crucially it is NOT a witness UI and exposes no
 * way to mint a "matched" outcome from Oxford — records can only be seeded as
 * RI would have produced them, so divergence tests are honest.
 */
export class RiWitnessStubProvider implements WitnessingProvider {
  private readonly pushed: WitnessDemographics[] = [];
  private readonly records = new Map<string, RiWitnessRecord[]>();

  /** Seed an RI record as the device would have returned it (test/scaffold). */
  seedRecord(cycleId: string, record: RiWitnessRecord): void {
    const list = this.records.get(cycleId) ?? [];
    list.push(record);
    this.records.set(cycleId, list);
  }

  /** Convenience: seed an RI record that agrees with a handling event. */
  seedMatching(event: OxfordHandlingEvent, riRecordId: string, witnessedAt: string): void {
    this.seedRecord(event.cycleId, {
      riRecordId,
      oxfordKey: event.oxfordKey,
      patientId: event.patientId,
      sampleId: event.sampleId,
      outcome: "witnessed",
      witnessedAt,
    });
  }

  pushedDemographics(): readonly WitnessDemographics[] {
    return this.pushed;
  }

  async pushDemographics(demographics: WitnessDemographics): Promise<void> {
    this.pushed.push(demographics);
  }

  async fetchRecordsForCycle(cycleId: string): Promise<readonly RiWitnessRecord[]> {
    return this.records.get(cycleId) ?? [];
  }
}
