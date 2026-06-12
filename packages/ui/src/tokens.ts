// Oxford Medical design tokens (docs/02 §2). The React component library (built
// from Phase 1) consumes these; keeping them framework-free means they are
// testable now and shareable across web + portal.

export const typography = {
  /** Display / headings. */
  serif: '"Cormorant Garamond", Georgia, serif',
  /** Body / UI. */
  sans: '"DM Sans", "Inter Tight", system-ui, sans-serif',
} as const;

/** Oxford palette. Values are placeholders to be confirmed against the brand
 *  guide; the token NAMES are the stable contract the component library uses. */
export const palette = {
  oxfordBlue: "#002147",
  parchment: "#FBF7EF",
  ink: "#1A1A1A",
  clinicalTeal: "#1F6F78",
  alert: "#B3261E",
  success: "#1E7B4F",
} as const;

/** 4px base spacing scale. */
export const spacing = [0, 4, 8, 12, 16, 24, 32, 48, 64] as const;

export type PaletteToken = keyof typeof palette;
