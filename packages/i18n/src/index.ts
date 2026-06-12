// @oxford/i18n — bilingual (en/ar) + RTL infrastructure. Platform package.
export {
  LOCALES,
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
  type Direction,
  type Messages,
  type Catalog,
} from "./types.js";
export { directionFor, isRtl } from "./direction.js";
export { I18n, MissingTranslationError, type TranslateParams } from "./i18n.js";
export { allKeys, findMissingKeys, assertCatalogComplete } from "./catalog.js";
export {
  formatNumber,
  formatGregorian,
  formatHijri,
  bilingualCalendarDate,
  type BilingualCalendarDate,
} from "./format.js";
export { coreMessages } from "./messages.js";
export { i18nSchema, translationKey, translation } from "./schema.js";
