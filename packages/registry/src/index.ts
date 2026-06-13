// @oxford/registry — patient & couple registry with the marriage-verification
// hard gate. Domain module (depends on audit, crypto, core).
export type {
  Person,
  PersonId,
  PersonName,
  Contact,
  Sex,
  LanguagePref,
  RegisterPersonInput,
} from "./person.js";
export type { Couple, CoupleId, CoupleStatus, MarriageVerificationId } from "./couple.js";
export { spermSource, oocyteSource } from "./gametes.js";
export {
  isMarriageVerified,
  assertMayStartFertility,
  type MarriageVerification,
} from "./marriage.js";
export { personIsLiving, type DeathRecord, type DeathRecordId } from "./vital-status.js";
export { RegistryService, type VerifyMarriageInput, type RecordDeathInput } from "./registry-service.js";
export { InMemoryRegistryStore, type RegistryStore } from "./store.js";
export { PgRegistryStore } from "./pg-store.js";
export { registrySchema, person, couple, marriageVerification, deathRecord } from "./schema.js";
