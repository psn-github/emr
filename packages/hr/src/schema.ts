// Drizzle schema for the `hr` domain (docs/01 §E14). Staff registry, credentials
// (licence/competency with expiry), and rota shifts.
import { pgSchema, text, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const hrSchema = pgSchema("hr");

export const staff = hrSchema.table("staff", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  professionalId: text("professional_id"),
  active: boolean("active").notNull().default(true),
});

export const credential = hrSchema.table(
  "credential",
  {
    id: text("id").primaryKey(),
    staffId: text("staff_id").notNull(),
    type: text("type").notNull(),
    name: text("name").notNull(),
    authority: text("authority"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => ({ byStaff: index("credential_staff_idx").on(t.staffId) }),
);

export const shift = hrSchema.table(
  "shift",
  {
    id: text("id").primaryKey(),
    staffId: text("staff_id").notNull(),
    resourceId: text("resource_id").notNull(),
    start: timestamp("start", { withTimezone: true }).notNull(),
    end: timestamp("end", { withTimezone: true }).notNull(),
    role: text("role").notNull(),
  },
  (t) => ({ byResource: index("shift_resource_idx").on(t.resourceId) }),
);

/** Practitioner leave (docs/01 §E2 P1) — overrides the rota for availability. */
export const leave = hrSchema.table(
  "leave",
  {
    id: text("id").primaryKey(),
    staffId: text("staff_id").notNull(),
    type: text("type").notNull(),
    start: timestamp("start", { withTimezone: true }).notNull(),
    end: timestamp("end", { withTimezone: true }).notNull(),
    note: text("note"),
  },
  (t) => ({ byStaff: index("leave_staff_idx").on(t.staffId) }),
);
