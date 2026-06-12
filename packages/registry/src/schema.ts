// Drizzle schema for the `registry` domain (ADR-0008). The Civil ID column holds
// the ENCRYPTED envelope only (field-level encryption, docs/02 §5) — never the
// plaintext. Cross-references are logical ids (no cross-module DB FKs). Soft
// delete only: `deleted_at` / `merged_into`, never a row removal.
import { pgSchema, date, text, timestamp } from "drizzle-orm/pg-core";

export const registrySchema = pgSchema("registry");

export const person = registrySchema.table("person", {
  id: text("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  /** Encrypted Civil ID envelope (iv.tag.ciphertext) — never plaintext. */
  civilIdEnc: text("civil_id_enc").notNull(),
  dob: date("dob").notNull(),
  sex: text("sex").notNull(),
  nationality: text("nationality").notNull(),
  languagePref: text("language_pref").notNull().default("ar"),
  phone: text("phone"),
  email: text("email"),
  photoRef: text("photo_ref"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  mergedInto: text("merged_into"),
});

export const couple = registrySchema.table("couple", {
  id: text("id").primaryKey(),
  husbandPersonId: text("husband_person_id").notNull(),
  wifePersonId: text("wife_person_id").notNull(),
  marriageVerificationId: text("marriage_verification_id"),
  status: text("status").notNull().default("pending_verification"),
});

export const marriageVerification = registrySchema.table("marriage_verification", {
  id: text("id").primaryKey(),
  coupleId: text("couple_id").notNull(),
  documentRef: text("document_ref").notNull(),
  verifiedBy: text("verified_by").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
  method: text("method").notNull(),
});
