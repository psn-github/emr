import { describe, expect, it } from "vitest";
import { I18n, MissingTranslationError } from "./i18n.js";
import type { Catalog } from "./types.js";

const catalog: Catalog = {
  en: { greeting: "Hello {name}", only_en: "english-only" },
  ar: { greeting: "مرحبا {name}" },
};

describe("I18n", () => {
  const i18n = new I18n(catalog);

  it("interpolates named params", () => {
    expect(i18n.t("greeting", "en", { name: "Sara" })).toBe("Hello Sara");
  });

  it("leaves placeholders untouched when no params are given", () => {
    expect(i18n.t("greeting", "ar")).toBe("مرحبا {name}");
  });

  it("leaves a placeholder untouched when its param is absent", () => {
    expect(i18n.t("greeting", "ar", {})).toBe("مرحبا {name}");
  });

  it("falls back to the default locale for a key missing in the requested locale", () => {
    expect(i18n.t("only_en", "ar")).toBe("english-only");
  });

  it("throws when a key is absent in every locale", () => {
    expect(() => i18n.t("nope", "en")).toThrow(MissingTranslationError);
  });

  it("reports key presence per locale", () => {
    expect(i18n.has("greeting", "ar")).toBe(true);
    expect(i18n.has("only_en", "ar")).toBe(false);
  });
});
