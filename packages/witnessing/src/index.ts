// @oxford/witnessing — RI Witness reconciliation seam (CLAUDE.md hard rule;
// ADR-0018). RI Witness (RFID) in the lab is authoritative. Oxford is
// demographic master into RI and consumer of witnessing back; it reconciles
// every handling event and BLOCKS cycle-step sign-off on any divergence. No
// competing witness UI, no override. Platform package (core + audit).
export type {
  HandlingEventId,
  ReconciliationId,
  WitnessStatus,
  DivergenceReason,
  RiWitnessOutcome,
  OxfordHandlingEvent,
  RiWitnessRecord,
  WitnessReconciliation,
} from "./types.js";
export {
  reconcileEvent,
  reconcileCycle,
  orphanRiRecords,
  assertSignOffAllowed,
} from "./reconcile.js";
export type { WitnessingProvider, WitnessDemographics } from "./provider.js";
export { RiWitnessStubProvider } from "./provider.js";
export { type WitnessingStore, InMemoryWitnessingStore } from "./store.js";
export { PgWitnessingStore } from "./pg-store.js";
export { WitnessingService, type RegisterHandlingInput } from "./witnessing-service.js";
export { witnessingSchema, handlingEvent, reconciliation } from "./schema.js";
