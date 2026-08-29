import { describe, it, expect, beforeEach } from "vitest";
import { loadShortcuts, saveShortcuts, comboFromEvent, matchesCombo, formatCombo, DEFAULT_SHORTCUTS } from "./shortcuts";

function key(init: Partial<KeyboardEventInit> & { key: string }): KeyboardEvent {
  return new KeyboardEvent("keydown", init);
}

describe("loadShortcuts / saveShortcuts", () => {
  beforeEach(() => localStorage.clear());

  it("returns the defaults when nothing is stored", () => {
    expect(loadShortcuts()).toEqual(DEFAULT_SHORTCUTS);
  });

  it("round-trips a saved override", () => {
    const custom = { ...DEFAULT_SHORTCUTS, save: "Mod+Alt+S" };
    saveShortcuts(custom);
    expect(loadShortcuts()).toEqual(custom);
  });

  it("falls back to defaults when the stored value is corrupted JSON", () => {
    localStorage.setItem("mdviewer.shortcuts", "{not valid json");
    expect(loadShortcuts()).toEqual(DEFAULT_SHORTCUTS);
  });

  it("merges a partial stored object with the defaults", () => {
    localStorage.setItem("mdviewer.shortcuts", JSON.stringify({ save: "Mod+Alt+S" }));
    expect(loadShortcuts()).toEqual({ ...DEFAULT_SHORTCUTS, save: "Mod+Alt+S" });
  });
});

describe("comboFromEvent", () => {
  it("returns null while only a modifier key is held", () => {
    expect(comboFromEvent(key({ key: "Control", ctrlKey: true }))).toBeNull();
  });

  it("captures a plain letter with Ctrl", () => {
    expect(comboFromEvent(key({ key: "s", ctrlKey: true }))).toBe("Mod+S");
  });

  it("captures Ctrl+Shift+letter", () => {
    expect(comboFromEvent(key({ key: "o", ctrlKey: true, shiftKey: true }))).toBe("Mod+Shift+O");
  });

  it("captures a non-letter key unchanged", () => {
    expect(comboFromEvent(key({ key: "F2" }))).toBe("F2");
  });

  it("captures Alt combos", () => {
    expect(comboFromEvent(key({ key: "x", altKey: true }))).toBe("Alt+X");
  });
});

describe("matchesCombo", () => {
  it("matches an exact combo", () => {
    expect(matchesCombo(key({ key: "s", ctrlKey: true }), "Mod+S")).toBe(true);
  });

  it("does not match when an extra modifier is held", () => {
    expect(matchesCombo(key({ key: "s", ctrlKey: true, shiftKey: true }), "Mod+S")).toBe(false);
  });

  it("does not match a different key", () => {
    expect(matchesCombo(key({ key: "d", ctrlKey: true }), "Mod+S")).toBe(false);
  });

  it("is case-insensitive for letter keys", () => {
    expect(matchesCombo(key({ key: "S", ctrlKey: true }), "Mod+S")).toBe(true);
  });

  it("returns false for an empty (unassigned) combo", () => {
    expect(matchesCombo(key({ key: "s", ctrlKey: true }), "")).toBe(false);
  });
});

describe("formatCombo", () => {
  it("renders Mod as Ctrl", () => {
    expect(formatCombo("Mod+Shift+O")).toBe("Ctrl+Shift+O");
  });

  it("leaves non-Mod parts untouched", () => {
    expect(formatCombo("Alt+F2")).toBe("Alt+F2");
  });
});
