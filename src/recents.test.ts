import { describe, it, expect, beforeEach } from "vitest";
import { getRecents, addRecent } from "./recents";

describe("recents", () => {
  beforeEach(() => localStorage.clear());

  it("returns an empty list when nothing is stored", () => {
    expect(getRecents()).toEqual([]);
  });

  it("adds an entry with a label derived from the path", () => {
    addRecent("C:\\docs\\guide.md", false);
    const recents = getRecents();
    expect(recents).toHaveLength(1);
    expect(recents[0]).toEqual({ path: "C:\\docs\\guide.md", isFolder: false, label: "guide.md" });
  });

  it("puts the most recently added entry first", () => {
    addRecent("C:\\a.md", false);
    addRecent("C:\\b.md", false);
    expect(getRecents().map((r) => r.path)).toEqual(["C:\\b.md", "C:\\a.md"]);
  });

  it("moves a re-added path to the front instead of duplicating it", () => {
    addRecent("C:\\a.md", false);
    addRecent("C:\\b.md", false);
    addRecent("C:\\a.md", false);
    const recents = getRecents();
    expect(recents.map((r) => r.path)).toEqual(["C:\\a.md", "C:\\b.md"]);
    expect(recents).toHaveLength(2);
  });

  it("caps the list at 8 entries", () => {
    for (let i = 0; i < 12; i++) addRecent(`C:\\file${i}.md`, false);
    expect(getRecents()).toHaveLength(8);
    expect(getRecents()[0].path).toBe("C:\\file11.md");
  });

  it("recovers from corrupted storage", () => {
    localStorage.setItem("mdviewer.recents", "{not json");
    expect(getRecents()).toEqual([]);
  });

  it("tracks folders distinctly from files", () => {
    addRecent("C:\\project", true);
    expect(getRecents()[0].isFolder).toBe(true);
  });
});
