// The witnessing seam, as andrology needs it (dependency inversion). Wired to
// @oxford/witnessing in the app layer. A sperm freeze is a witnessed handling
// event: andrology registers it for reconciliation against RI Witness, which is
// authoritative. Andrology never witnesses.

export interface HandlingEventInput {
  readonly cycleId: string;
  readonly stepKey: string;
  readonly oxfordKey: string;
  readonly patientId: string;
  readonly sampleId: string;
  readonly occurredAt: string;
}

export interface WitnessPort {
  registerHandlingEvent(actorId: string, input: HandlingEventInput): Promise<void>;
}
