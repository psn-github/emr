// Oxford Medical / OM-Software design tokens — distilled from the canonical
// om-software EMR design system (PALETTE.md, product-owner supplied). The EMR
// and the existing clinical tools are deliberately ONE visual family.
//
// NOTE: docs/02 §2 names "Cormorant Garamond + DM Sans/Inter Tight" — superseded
// here by the canonical palette below (Satoshi / Plus Jakarta Sans / Geist /
// Noto Sans Arabic). Logged as AMD-0001 for a docs/02 update.
//
// Aesthetic: Luxury Minimal — warm neutrals (never cold grey), one teal-green
// accent, semantic/clinical colours reserved strictly for meaning.

export const typography = {
  /** Display / hero — Satoshi 700. */
  display: '"Satoshi", system-ui, sans-serif',
  /** Body + UI/labels — Plus Jakarta Sans. */
  body: '"Plus Jakarta Sans", system-ui, sans-serif',
  /** Data / tables — Geist, with tabular numerals for dosages, dates, lab values. */
  data: '"Geist", ui-monospace, monospace',
  mono: '"Geist Mono", ui-monospace, monospace',
  /** Arabic — pairs with Plus Jakarta Sans at matching weights. */
  arabic: '"Noto Sans Arabic", system-ui, sans-serif',
} as const;

/** Light theme (canvas/surface/text/accent/borders + semantic). */
export const palette = {
  bg: "#F5F5F0", // warm off-white canvas — page background is ALWAYS this, never white
  surface: "#FFFFFF", // cards/panels/modals
  textPrimary: "#1D1D1F",
  textSecondary: "#6E6E73",
  textTertiary: "#AEAEB2",
  accent: "#2A7C6F", // teal-green — medical trust without the hospital-blue cliché
  accentHover: "#1F5F55",
  accentLight: "rgba(42,124,111,0.08)",
  border: "#E8E8E3",
  borderSubtle: "#F0F0EB",
  success: "#34A853",
  warning: "#D4A024",
  error: "#C4302B",
  info: "#2A7C6F",
} as const;

/** Dark theme overrides. */
export const paletteDark = {
  bg: "#161618",
  surface: "#1C1C1E",
  textPrimary: "#F5F5F7",
  textSecondary: "#A1A1A6",
  textTertiary: "#636366",
  accent: "#3AAFA0",
  accentHover: "#4DC9B8",
  accentLight: "rgba(58,175,160,0.12)",
  border: "#2C2C2E",
  borderSubtle: "#232325",
} as const;

/**
 * Clinical status colours — RESERVED for meaning, never decorative, and ALWAYS
 * paired with an icon/text label (colour-blind safety; PALETTE §10).
 */
export const clinicalStatus = {
  cycle: { active: "#2A7C6F", paused: "#D4A024", complete: "#34A853", cancelled: "#C4302B" },
  embryoGrade: { A: "#34A853", B: "#2A7C6F", C: "#D4A024", D: "#C4302B" },
} as const;

/**
 * Drug-class colours — fixed per class, consistent across every view (cycle
 * sheet, stim chart). Trigger is red: time-critical, high visibility.
 */
export const drugClassColor = {
  gnrhAgonist: "#6366F1",
  gnrhAntagonist: "#8B5CF6",
  gonadotropinFsh: "#2563EB",
  gonadotropinHmg: "#0891B2",
  trigger: "#DC2626",
  progesterone: "#F59E0B",
  estrogen: "#EC4899",
  anticoagulant: "#6B7280",
  other: "#10B981",
} as const;

/** 8px base spacing scale: 2xs…4xl. */
export const spacing = {
  "2xs": 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 48,
  "3xl": 64,
  "4xl": 80,
} as const;

/** Type scale (px). */
export const typeScale = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 18,
  lg: 22,
  xl: 28,
  "2xl": 36,
  "3xl": 48,
} as const;

export const radius = { sm: 8, md: 12, lg: 16, full: 9999 } as const;

export const shadow = {
  xs: "0 1px 2px rgba(0,0,0,0.03)",
  sm: "0 1px 2px rgba(0,0,0,0.04)",
  md: "0 4px 12px rgba(0,0,0,0.06)",
  lg: "0 8px 30px rgba(0,0,0,0.08)",
  card: "0 2px 10px rgba(0,0,0,0.04)",
} as const;

export type PaletteToken = keyof typeof palette;
export type DrugClass = keyof typeof drugClassColor;
