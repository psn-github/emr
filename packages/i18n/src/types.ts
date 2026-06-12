// Bilingual infrastructure (ADR-0004): en + ar, RTL first-class, from commit one.

export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export type Direction = "ltr" | "rtl";

/** A flat map of translation key → string for one locale. Keys are dotted
 *  namespaces, e.g. "action.save", "registry.marriage.unverified". */
export type Messages = Readonly<Record<string, string>>;

/** Every locale's messages. Completeness across locales is enforced (no
 *  untranslated strings) — see assertCatalogComplete. */
export type Catalog = Readonly<Record<Locale, Messages>>;

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
