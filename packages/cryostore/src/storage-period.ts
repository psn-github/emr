import type { StorageConsent } from "./types.js";

// Storage consent / expiry tracking (pure, 100%). The legal storage maximum is
// CONFIGURATION (docs/03; pending legal confirm) — passed in as years, never
// hardcoded. Expiry NEVER triggers automatic disposition: it raises an alert; the
// terminal step is a reviewed human decision (AMD-0003).

/** Compute the storage-consent expiry from the consent date + configured years. */
export function computeExpiry(consentedAt: string, storageYears: number): string {
  const d = new Date(consentedAt);
  d.setUTCFullYear(d.getUTCFullYear() + storageYears);
  return d.toISOString();
}

/** Is the consent expired as of `asOf` (inclusive of the expiry instant)? */
export function isExpired(consent: StorageConsent, asOf: Date): boolean {
  return asOf.getTime() >= new Date(consent.expiresAt).getTime();
}

/** Is the consent not yet expired but due within `days` of `asOf`? (renewal alert) */
export function expiresWithin(consent: StorageConsent, asOf: Date, days: number): boolean {
  if (isExpired(consent, asOf)) return false;
  const windowEnd = asOf.getTime() + days * 24 * 60 * 60 * 1000;
  return new Date(consent.expiresAt).getTime() <= windowEnd;
}
