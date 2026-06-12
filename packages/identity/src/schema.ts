// Drizzle schema for the `identity` domain (ADR-0008). Roles and assignments are
// config data (versioned, admin-editable). Cross-module references (e.g.
// staff.person_id → registry.person) are stored as logical ids, NOT database
// foreign keys, to keep module boundaries hard (docs/02 §1: no cross-module
// table access).
import { pgSchema, jsonb, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const identitySchema = pgSchema("identity");

/** A licensed staff member. `person_id` is a logical reference into the registry
 *  module. MOH licence + competencies drive restricted-action gating. */
export const staff = identitySchema.table("staff", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull(),
  status: text("status").notNull().default("active"),
  mohLicence: text("moh_licence"),
  licenceExpiry: timestamp("licence_expiry", { withTimezone: true }),
  competencies: jsonb("competencies").$type<string[]>().notNull().default([]),
});

/** A named bundle of permissions. */
export const role = identitySchema.table("role", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
});

/** Deny-by-default: a staff member has no access until assigned a role. */
export const roleAssignment = identitySchema.table(
  "role_assignment",
  {
    staffId: text("staff_id").notNull(),
    roleId: text("role_id").notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    uq: uniqueIndex("role_assignment_uq").on(t.staffId, t.roleId),
  }),
);
