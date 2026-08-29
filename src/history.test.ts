import { describe, it, expect, beforeEach } from "vitest";
import { getSnapshots, addSnapshot, clearHistory } from "./history";

describe("history", () => {
  beforeEach(() => localStorage.clear());

  it("returns an empty list for a file with no history", () => {
    expect(getSnapshots("C:\\a.md")).toEqual([]);
  });

  it("records a snapshot with its timestamp and content", () => {
    addSnapshot("C:\\a.md", "hello", 1000);
    expect(getSnapshots("C:\\a.md")).toEqual([{ timestamp: 1000, content: "hello" }]);
  });

  it("orders snapshots most-recent first", () => {
    addSnapshot("C:\\a.md", "one", 1000);
    addSnapshot("C:\\a.md", "two", 2000);
    expect(getSnapshots("C:\\a.md").map((s) => s.content)).toEqual(["two", "one"]);
  });

  it("skips adding a snapshot identical to the most recent one", () => {
    addSnapshot("C:\\a.md", "same", 1000);
    addSnapshot("C:\\a.md", "same", 2000);
    expect(getSnapshots("C:\\a.md")).toHaveLength(1);
  });

  it("still records a snapshot that differs even if an older one matches", () => {
    addSnapshot("C:\\a.md", "same", 1000);
    addSnapshot("C:\\a.md", "different", 2000);
    addSnapshot("C:\\a.md", "same", 3000);
    expect(getSnapshots("C:\\a.md")).toHaveLength(3);
  });

  it("caps history at 15 snapshots per file", () => {
    for (let i = 0; i < 20; i++) addSnapshot("C:\\a.md", `v${i}`, i);
    const snapshots = getSnapshots("C:\\a.md");
    expect(snapshots).toHaveLength(15);
    expect(snapshots[0].content).toBe("v19");
  });

  it("keeps separate history per file", () => {
    addSnapshot("C:\\a.md", "a-content", 1000);
    addSnapshot("C:\\b.md", "b-content", 1000);
    expect(getSnapshots("C:\\a.md")).toEqual([{ timestamp: 1000, content: "a-content" }]);
    expect(getSnapshots("C:\\b.md")).toEqual([{ timestamp: 1000, content: "b-content" }]);
  });

  it("clears history for one file without affecting others", () => {
    addSnapshot("C:\\a.md", "a-content", 1000);
    addSnapshot("C:\\b.md", "b-content", 1000);
    clearHistory("C:\\a.md");
    expect(getSnapshots("C:\\a.md")).toEqual([]);
    expect(getSnapshots("C:\\b.md")).toHaveLength(1);
  });

  it("recovers from corrupted storage", () => {
    localStorage.setItem("mdviewer.history", "{not json");
    expect(getSnapshots("C:\\a.md")).toEqual([]);
  });

  it("evicts the file with the oldest snapshot once the file cap is reached", () => {
    for (let i = 0; i < 50; i++) addSnapshot(`C:\\file${i}.md`, "content", i);
    addSnapshot("C:\\new.md", "content", 1000);
    expect(getSnapshots("C:\\file0.md")).toEqual([]);
    expect(getSnapshots("C:\\file1.md")).toHaveLength(1);
    expect(getSnapshots("C:\\new.md")).toHaveLength(1);
  });
});
