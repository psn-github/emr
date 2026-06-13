import type { Result, AppError } from "@oxford/core";

// The witnessing seam, as embryology needs it (dependency inversion). The app
// layer wires this to @oxford/witnessing's WitnessingService. Embryology never
// reimplements witnessing — RI Witness is authoritative; this port only lets the
// lab REGISTER the handling events it observed and ASK whether a cycle step may
// be signed off (which the witnessing service blocks on any divergence).

export interface HandlingEventInput {
  readonly cycleId: string;
  readonly stepKey: string;
  readonly oxfordKey: string;
  readonly patientId: string;
  readonly sampleId: string;
  readonly occurredAt: string;
}

export interface WitnessPort {
  /** Record a gamete/embryo handling event for reconciliation against RI. */
  registerHandlingEvent(actorId: string, input: HandlingEventInput): Promise<void>;
  /** Allowed only if every handling event reconciles `matched` with RI Witness. */
  assertCycleStepSignOff(cycleId: string): Promise<Result<void, AppError>>;
}
