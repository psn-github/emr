import type { LabQcReading } from "./types.js";

/** Filter for the QC reading log (by parameter, equipment, lot, or since a time). */
export interface QcReadingFilter {
  readonly parameterCode?: string;
  readonly assetRef?: string;
  readonly lotNo?: string;
  readonly since?: string; // ISO, inclusive
}

export interface QcReadingStore {
  save(reading: LabQcReading): Promise<void>;
  /** Readings matching the filter, newest first. */
  list(filter: QcReadingFilter): Promise<readonly LabQcReading[]>;
}

export class InMemoryQcReadingStore implements QcReadingStore {
  private readonly readings: LabQcReading[] = [];

  async save(reading: LabQcReading): Promise<void> {
    this.readings.push(reading);
  }
  async list(filter: QcReadingFilter): Promise<readonly LabQcReading[]> {
    return this.readings
      .filter((r) =>
        (filter.parameterCode === undefined || r.parameterCode === filter.parameterCode) &&
        (filter.assetRef === undefined || r.assetRef === filter.assetRef) &&
        (filter.lotNo === undefined || r.lotNo === filter.lotNo) &&
        (filter.since === undefined || r.recordedAt >= filter.since),
      )
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  }
}
