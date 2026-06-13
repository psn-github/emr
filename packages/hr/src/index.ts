// @oxford/hr — light HR (docs/01 §E14, ADR-0040). Domain module: core + audit.
// Staff registry, MOH licence + competency records with expiry tracking +
// due/overdue alerts, and rota shifts feeding scheduling resource availability.
// Competency currency informs (never silently blocks) witnessing eligibility.
// Full payroll stays external.
export type { StaffId, CredentialId, ShiftId, Staff, CredentialType, Credential, Shift } from "./types.js";
export { credentialStatus, validateCredentialDates, validateShift, overlaps, type CredentialStatus } from "./hr.js";
export { type HrStore, InMemoryHrStore } from "./store.js";
export { PgHrStore } from "./pg-store.js";
export {
  HrService,
  type RegisterStaffInput,
  type AddCredentialInput,
  type PlanShiftInput,
  type CredentialAlert,
  type CredentialAlerts,
} from "./hr-service.js";
export { hrSchema, staff, credential, shift } from "./schema.js";
