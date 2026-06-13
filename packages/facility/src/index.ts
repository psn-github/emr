// @oxford/facility — the building model (floors, locations, beds) + bed-status
// operations. Domain module (depends on audit + core). The flow board (PR 1.3)
// reads bed status and tracks patient location on top of this.
export type {
  FloorLevel,
  LocationNodeType,
  BedStatus,
  Floor,
  FloorId,
  LocationNode,
  LocationNodeId,
  Bed,
  BedId,
  BilingualName,
} from "./types.js";
export { canTransition, assertTransition } from "./bed.js";
export { FacilityService } from "./facility-service.js";
export { type FacilityStore, InMemoryFacilityStore } from "./store.js";
export { PgFacilityStore } from "./pg-store.js";
export { seedFacility, type SeedResult } from "./seed.js";
export { facilitySchema, floor, locationNode, bed, patientLocation, locationMovement } from "./schema.js";

// Patient-flow & bed board (PHI: who is where).
export type {
  PatientFlowStatus,
  PatientLocation,
  LocationMovement,
  LocationMovementId,
  BoardPatient,
  BoardLocation,
  BoardBed,
  BedCapacity,
  FlowBoard,
} from "./flow-types.js";
export { FlowService, type MoveOptions } from "./flow-service.js";
export { type FlowStore, InMemoryFlowStore } from "./flow-store.js";
export { PgFlowStore } from "./flow-pg-store.js";
