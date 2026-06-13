// @oxford/scheduling — multi-resource, multi-practitioner scheduling across all
// four levels. Domain module (depends on audit + core). Resources reference
// facility locations by logical id (no cross-module import).
export type {
  ResourceKind,
  FloorLevel,
  Resource,
  ResourceId,
  AppointmentType,
  AppointmentTypeId,
  Appointment,
  AppointmentId,
  AppointmentStatus,
  BilingualName,
} from "./types.js";
export { intervalsOverlap, findConflicts, type ProposedSlot } from "./conflict.js";
export { canTransition, assertTransition } from "./status.js";
export { SchedulingService, type BookInput } from "./scheduling-service.js";
export { type SchedulingStore, InMemorySchedulingStore } from "./store.js";
export { PgSchedulingStore } from "./pg-store.js";
export { schedulingSchema, resource, appointmentType, appointment } from "./schema.js";
