import { describe, it, expect, beforeEach } from "vitest";
import { t, setLanguage, getLanguage } from "./i18n";

describe("i18n", () => {
  beforeEach(() => setLanguage("it"));

  it("defaults to Italian", () => {
    expect(getLanguage()).toBe("it");
    expect(t("toolbar.openFolder")).toBe("Apri cartella");
  });

  it("switches language and translates accordingly", () => {
    setLanguage("en");
    expect(getLanguage()).toBe("en");
    expect(t("toolbar.openFolder")).toBe("Open folder");
  });

  it("substitutes {placeholders} with the given values", () => {
    setLanguage("en");
    expect(t("status.openError", { error: "boom" })).toBe("Could not open file: boom");
  });

  it("falls back to the key itself for an unknown key", () => {
    expect(t("this.key.does.not.exist")).toBe("this.key.does.not.exist");
  });
});
