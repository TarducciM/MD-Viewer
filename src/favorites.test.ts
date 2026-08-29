import { describe, it, expect, beforeEach } from "vitest";
import { getFavorites, addFavorite, removeFavorite, toggleFavorite, isFavorite } from "./favorites";

describe("favorites", () => {
  beforeEach(() => localStorage.clear());

  it("returns an empty list when nothing is stored", () => {
    expect(getFavorites()).toEqual([]);
  });

  it("adds an entry with a label derived from the path", () => {
    addFavorite("C:\\docs\\guide.md");
    expect(getFavorites()).toEqual([{ path: "C:\\docs\\guide.md", label: "guide.md" }]);
  });

  it("does not duplicate an already-favorited path", () => {
    addFavorite("C:\\a.md");
    addFavorite("C:\\a.md");
    expect(getFavorites()).toHaveLength(1);
  });

  it("preserves insertion order", () => {
    addFavorite("C:\\a.md");
    addFavorite("C:\\b.md");
    expect(getFavorites().map((f) => f.path)).toEqual(["C:\\a.md", "C:\\b.md"]);
  });

  it("removes a favorite by path", () => {
    addFavorite("C:\\a.md");
    addFavorite("C:\\b.md");
    removeFavorite("C:\\a.md");
    expect(getFavorites().map((f) => f.path)).toEqual(["C:\\b.md"]);
  });

  it("reports favorite status via isFavorite", () => {
    addFavorite("C:\\a.md");
    expect(isFavorite("C:\\a.md")).toBe(true);
    expect(isFavorite("C:\\b.md")).toBe(false);
  });

  it("toggleFavorite adds when absent and removes when present, returning the new state", () => {
    expect(toggleFavorite("C:\\a.md")).toBe(true);
    expect(isFavorite("C:\\a.md")).toBe(true);
    expect(toggleFavorite("C:\\a.md")).toBe(false);
    expect(isFavorite("C:\\a.md")).toBe(false);
  });

  it("recovers from corrupted storage", () => {
    localStorage.setItem("mdviewer.favorites", "{not json");
    expect(getFavorites()).toEqual([]);
  });

  it("caps the list at 30 entries", () => {
    for (let i = 0; i < 35; i++) addFavorite(`C:\\file${i}.md`);
    expect(getFavorites()).toHaveLength(30);
  });
});
