// Antenatal / obstetric pure logic (docs/01 §E2 P1, 100% covered). Dating by
// Naegele's rule; gestational age from LMP; a config-driven visit schedule; and
// per-visit risk flagging. Thresholds/schedule are CONFIGURATION (clinic-overridable).

const DAY_MS = 86_400_000;

/** Estimated delivery date: LMP + 280 days (Naegele's rule). ISO date (YYYY-MM-DD). */
export function estimateEdd(lmp: string): string {
  const edd = new Date(new Date(lmp).getTime() + 280 * DAY_MS);
  return edd.toISOString().slice(0, 10);
}

/** Whole completed gestational weeks from LMP to a date (0 if before LMP). */
export function gestationWeeks(lmp: string, at: string): number {
  const days = Math.floor((new Date(at).getTime() - new Date(lmp).getTime()) / DAY_MS);
  return days < 0 ? 0 : Math.floor(days / 7);
}

/** Default NICE-style antenatal visit schedule (gestational weeks; config). */
export const DEFAULT_VISIT_SCHEDULE_WEEKS: readonly number[] = [8, 12, 16, 20, 25, 28, 31, 34, 36, 38, 40, 41];

export interface PlannedVisit {
  readonly week: number;
  readonly dueAt: string; // ISO date
}

/** Planned antenatal visits from an LMP + a schedule (each week → due date). */
export function plannedVisits(lmp: string, weeks: readonly number[] = DEFAULT_VISIT_SCHEDULE_WEEKS): readonly PlannedVisit[] {
  const base = new Date(lmp).getTime();
  return weeks.map((week) => ({ week, dueAt: new Date(base + week * 7 * DAY_MS).toISOString().slice(0, 10) }));
}

export interface VisitObservations {
  readonly gestationWeeks: number;
  readonly bpSystolic: number;
  readonly bpDiastolic: number;
  readonly fundalHeightCm?: number | null;
  readonly proteinuria?: boolean;
}

/** Derive risk flags for a visit. Pure; rules are explicit + clinic-tunable later. */
export function assessVisit(o: VisitObservations): readonly string[] {
  const flags: string[] = [];
  const hypertensive = o.bpSystolic >= 140 || o.bpDiastolic >= 90;
  if (hypertensive) flags.push("hypertension");
  if (o.proteinuria === true) flags.push("proteinuria");
  // Hypertension + proteinuria after 20 weeks → pre-eclampsia risk.
  if (hypertensive && o.proteinuria === true && o.gestationWeeks >= 20) flags.push("pre_eclampsia_risk");
  // Symphysis–fundal height should track gestation (±3 cm) from 24 weeks.
  if (o.fundalHeightCm !== undefined && o.fundalHeightCm !== null && o.gestationWeeks >= 24) {
    if (Math.abs(o.fundalHeightCm - o.gestationWeeks) > 3) flags.push("fundal_height_discrepancy");
  }
  return flags;
}
