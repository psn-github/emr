// Drizzle schema for the `cryostore` domain (docs/01 §E6). Specimens carry their
// owner (person|couple), addressable position, status, and witness key. Custody
// events are append-only; engagement tracks the AMD-0003 non-payment pathway.
import { pgSchema, text, integer, doublePrecision, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import type { CryoPosition, SpecimenOwner } from "./types.js";

export const cryostoreSchema = pgSchema("cryostore");

export const tank = cryostoreSchema.table("tank", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
});

export const cryoSpecimen = cryostoreSchema.table(
  "cryo_specimen",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    owner: jsonb("owner").$type<SpecimenOwner>().notNull(),
    cycleId: text("cycle_id").notNull(),
    straws: integer("straws").notNull(),
    position: jsonb("position").$type<CryoPosition>().notNull(),
    positionKey: text("position_key").notNull(),
    status: text("status").notNull(),
    freezeEventRef: text("freeze_event_ref").notNull(),
    witnessKey: text("witness_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    byOwner: index("cryo_specimen_owner_idx").on(t.cycleId),
    byPosition: index("cryo_specimen_position_idx").on(t.positionKey),
  }),
);

export const custodyEvent = cryostoreSchema.table(
  "custody_event",
  {
    id: text("id").primaryKey(),
    specimenId: text("specimen_id").notNull(),
    type: text("type").notNull(),
    fromPosition: jsonb("from_position").$type<CryoPosition | null>(),
    toPosition: jsonb("to_position").$type<CryoPosition | null>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    operator: text("operator").notNull(),
    witnessKey: text("witness_key").notNull(),
  },
  (t) => ({ bySpecimen: index("custody_event_specimen_idx").on(t.specimenId) }),
);

export const storageConsent = cryostoreSchema.table(
  "storage_consent",
  {
    id: text("id").primaryKey(),
    specimenId: text("specimen_id").notNull().unique(),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    renewedAt: timestamp("renewed_at", { withTimezone: true }),
  },
);

export const tankReading = cryostoreSchema.table(
  "tank_reading",
  {
    id: text("id").primaryKey(),
    tankId: text("tank_id").notNull(),
    temperatureC: doublePrecision("temperature_c").notNull(),
    nitrogenLevelPct: doublePrecision("nitrogen_level_pct").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (t) => ({ byTank: index("tank_reading_tank_idx").on(t.tankId) }),
);

export const engagement = cryostoreSchema.table("engagement", {
  specimenId: text("specimen_id").primaryKey(),
  state: text("state").notNull(),
});
