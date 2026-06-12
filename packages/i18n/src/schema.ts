// Drizzle schema for the `i18n` domain (ADR-0008). Translations are versioned
// config data (docs/02 §1): editable by authorised users, not hardcoded. The
// shipped TS catalog (messages.ts) seeds these tables; runtime overrides/edits
// live here.
import { pgSchema, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const i18nSchema = pgSchema("i18n");

export const translationKey = i18nSchema.table("translation_key", {
  key: text("key").primaryKey(),
  description: text("description"),
  domain: text("domain"),
});

export const translation = i18nSchema.table(
  "translation",
  {
    key: text("key").notNull(),
    locale: text("locale").notNull(),
    value: text("value").notNull(),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    uq: uniqueIndex("translation_key_locale_uq").on(t.key, t.locale),
  }),
);
