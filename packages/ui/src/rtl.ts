import type { Direction, Locale } from "@oxford/i18n";
import { directionFor } from "@oxford/i18n";

// RTL is first-class (CLAUDE.md). Components lay out with CSS *logical*
// properties (inline-start/inline-end), which the browser flips automatically
// from the document `dir`. These helpers set that direction from the active
// locale, and provide a physical-side mapping for the rare legacy API that
// needs "left"/"right".

export interface HtmlDirAttributes {
  readonly dir: Direction;
  readonly lang: Locale;
}

/** The `dir`/`lang` attributes to set on <html> for a locale. Setting these is
 *  what flips the entire UI to RTL Arabic. */
export function htmlDirAttributes(locale: Locale): HtmlDirAttributes {
  return { dir: directionFor(locale), lang: locale };
}

export type PhysicalSide = "left" | "right";

/** Map the logical inline-start to a physical side for a direction. */
export function inlineStart(direction: Direction): PhysicalSide {
  return direction === "rtl" ? "right" : "left";
}

/** Map the logical inline-end to a physical side for a direction. */
export function inlineEnd(direction: Direction): PhysicalSide {
  return direction === "rtl" ? "left" : "right";
}
