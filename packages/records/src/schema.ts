// Drizzle schema for the `records` domain (ADR-0065). MRN counter + assignments,
// the physical file registry (+ volumes), and append-only file movements.
import { pgSchema, text, integer, bigint, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const recordsSchema = pgSchema("records");

/** Per-year MRN sequence counter (monotonic; numbers are never reused). */
export const mrnCounter = recordsSchema.table("mrn_counter", {
  year: integer("year").primaryKey(),
  nextSeq: integer("next_seq").notNull(),
});

/** MRN assignment on a person (unique; `imported` = legacy Cliniko-era number). */
export const mrnAssignment = recordsSchema.table("mrn_assignment", {
  mrn: text("mrn").primaryKey(),
  personId: text("person_id").notNull().unique(),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull(),
  imported: boolean("imported").notNull().default(false),
});

export const patientFile = recordsSchema.table(
  "patient_file",
  {
    id: text("id").primaryKey(),
    personId: text("person_id").notNull(),
    mrn: text("mrn").notNull(),
    volume: integer("volume").notNull(),
    homeLocation: text("home_location").notNull(),
    status: text("status").notNull().default("active"),
    archiveLocation: text("archive_location"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => ({ byPerson: index("patient_file_person_idx").on(t.personId), byMrn: index("patient_file_mrn_idx").on(t.mrn) }),
);

export const fileMovement = recordsSchema.table(
  "file_movement",
  {
    id: text("id").primaryKey(),
    // Monotonic insertion order — the deterministic tiebreaker for "latest".
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
    fileId: text("file_id").notNull(),
    kind: text("kind").notNull(),
    toLocation: text("to_location").notNull(),
    toStaffId: text("to_staff_id"),
    note: text("note"),
    at: timestamp("at", { withTimezone: true }).notNull(),
  },
  (t) => ({ byFile: index("file_movement_file_idx").on(t.fileId, t.seq) }),
);
