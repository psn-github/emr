// @oxford/fertility — cycle engine + protocol library + consent gating. Domain
// module (audit + core). The marriage hard-gate is enforced via the injected
// FertilityGate seam (wired to registry in the app layer).
export type { Cycle, CycleId, CycleType, CycleStatus, CycleOwner, Protocol } from "./types.js";
export { PERSON_SCOPED_TYPES } from "./types.js";
export { canAdvance, assertAdvance } from "./lifecycle.js";
export { requiredConsents, assertConsentsComplete } from "./consent.js";
export type { FertilityGate } from "./gate.js";
export { SEED_PROTOCOLS } from "./protocols.js";
export { CycleService } from "./cycle-service.js";
export { type CycleStore, InMemoryCycleStore } from "./store.js";
export { PgCycleStore } from "./pg-store.js";
export { fertilitySchema, cycle, protocol } from "./schema.js";
