import type { Direction, Locale } from "./types.js";

const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(["ar"]);

/** Writing direction for a locale. Arabic is RTL — tested, not assumed
 *  (CLAUDE.md). UI uses logical CSS properties driven by this. */
export function directionFor(locale: Locale): Direction {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

export function isRtl(locale: Locale): boolean {
  return directionFor(locale) === "rtl";
}
