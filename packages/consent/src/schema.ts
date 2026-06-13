// Drizzle schema for the `consent` domain (docs/01 §E13). Partner-access grants.
import { pgSchema, text, timestamp, index } from "drizzle-orm/pg-core";

export const consentSchema = pgSchema("consent");

export const partnerAccessGrant = consentSchema.table(
  "partner_access_grant",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id").notNull(),
    partnerId: text("partner_id").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({ byPatient: index("partner_access_patient_idx").on(t.patientId), byPartner: index("partner_access_partner_idx").on(t.partnerId) }),
);
