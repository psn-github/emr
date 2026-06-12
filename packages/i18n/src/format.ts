import type { Locale } from "./types.js";

// Locale tags for Intl. Arabic uses the Gulf-appropriate region so numerals and
// formats match Khaleeji expectation (docs/03 §5).
const LOCALE_TAG: Record<Locale, string> = { en: "en-GB", ar: "ar-KW" };

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(LOCALE_TAG[locale]).format(value);
}

/** Gregorian date in the locale's conventions. */
export function formatGregorian(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], { dateStyle: "long" }).format(date);
}

/** Hijri (Umm al-Qura) date — displayed alongside Gregorian where culturally
 *  expected (docs/03 §5). */
export function formatHijri(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(`${LOCALE_TAG[locale]}-u-ca-islamic-umalqura`, {
    dateStyle: "long",
  }).format(date);
}

export interface BilingualCalendarDate {
  readonly gregorian: string;
  readonly hijri: string;
}

/** Both calendars for one instant, for the dual-calendar display. */
export function bilingualCalendarDate(date: Date, locale: Locale): BilingualCalendarDate {
  return { gregorian: formatGregorian(date, locale), hijri: formatHijri(date, locale) };
}
