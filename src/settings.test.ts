import { describe, it, expect, beforeEach } from "vitest";
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from "./settings";

describe("settings persistence", () => {
  beforeEach(() => localStorage.clear());

  it("returns the defaults when nothing is stored", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips a saved settings object", () => {
    const custom = { ...DEFAULT_SETTINGS, theme: "light" as const, fontSize: "large" as const };
    saveSettings(custom);
    expect(loadSettings()).toEqual(custom);
  });

  it("fills in missing keys with defaults when stored data is a partial/older shape", () => {
    localStorage.setItem("mdviewer.settings", JSON.stringify({ theme: "light" }));
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, theme: "light" });
  });

  it("falls back to defaults when the stored value is corrupted JSON", () => {
    localStorage.setItem("mdviewer.settings", "{not valid json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
