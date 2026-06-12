import type { Catalog, Locale, Messages } from "./types.js";
import { DEFAULT_LOCALE } from "./types.js";

export type TranslateParams = Readonly<Record<string, string | number>>;

export class MissingTranslationError extends Error {
  constructor(
    readonly key: string,
    readonly locale: Locale,
  ) {
    super(`missing translation for "${key}" in locale "${locale}"`);
    this.name = "MissingTranslationError";
  }
}

/**
 * The runtime translator. No hardcoded user-facing strings anywhere — every
 * string resolves through here (CLAUDE.md). Catalog completeness is enforced
 * separately (assertCatalogComplete), so a missing key is a programmer error
 * and throws rather than silently shipping an untranslated string.
 */
export class I18n {
  constructor(private readonly catalog: Catalog) {}

  has(key: string, locale: Locale): boolean {
    return Object.prototype.hasOwnProperty.call(this.messages(locale), key);
  }

  t(key: string, locale: Locale, params?: TranslateParams): string {
    const template = this.messages(locale)[key] ?? this.messages(DEFAULT_LOCALE)[key];
    if (template === undefined) throw new MissingTranslationError(key, locale);
    return interpolate(template, params);
  }

  private messages(locale: Locale): Messages {
    return this.catalog[locale];
  }
}

const PLACEHOLDER = /\{(\w+)\}/g;

function interpolate(template: string, params?: TranslateParams): string {
  if (params === undefined) return template;
  return template.replace(PLACEHOLDER, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}
