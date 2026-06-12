import type { Catalog, Locale } from "./types.js";
import { LOCALES } from "./types.js";

/** Every key that appears in any locale. */
export function allKeys(catalog: Catalog): readonly string[] {
  const keys = new Set<string>();
  for (const locale of LOCALES) {
    for (const key of Object.keys(catalog[locale])) keys.add(key);
  }
  return [...keys].sort();
}

/** Per-locale list of keys present elsewhere but missing here. */
export function findMissingKeys(catalog: Catalog): Record<Locale, string[]> {
  const universe = allKeys(catalog);
  const missing = {} as Record<Locale, string[]>;
  for (const locale of LOCALES) {
    const present = catalog[locale];
    missing[locale] = universe.filter(
      (key) => !Object.prototype.hasOwnProperty.call(present, key),
    );
  }
  return missing;
}

/**
 * Guarantees the "zero untranslated strings" exit-gate condition: every key is
 * translated in every locale. Run at startup and in CI on the shipped catalog.
 */
export function assertCatalogComplete(catalog: Catalog): void {
  const missing = findMissingKeys(catalog);
  const gaps = LOCALES.filter((l) => missing[l].length > 0).map(
    (l) => `${l}: ${missing[l].join(", ")}`,
  );
  if (gaps.length > 0) {
    throw new Error(`incomplete translation catalog — ${gaps.join("; ")}`);
  }
}
