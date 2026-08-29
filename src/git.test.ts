import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/plugin-shell", () => ({
  Command: { create: vi.fn() },
}));

const { parsePorcelainStatus } = await import("./git");

describe("parsePorcelainStatus", () => {
  it("returns an empty list for empty output", () => {
    expect(parsePorcelainStatus("")).toEqual([]);
  });

  it("parses a modified file", () => {
    expect(parsePorcelainStatus(" M file.md\0")).toEqual([{ path: "file.md", status: "modified" }]);
  });

  it("parses an untracked file", () => {
    expect(parsePorcelainStatus("?? newfile.md\0")).toEqual([{ path: "newfile.md", status: "untracked" }]);
  });

  it("parses a staged added file", () => {
    expect(parsePorcelainStatus("A  file.md\0")).toEqual([{ path: "file.md", status: "added" }]);
  });

  it("parses a deleted file", () => {
    expect(parsePorcelainStatus(" D file.md\0")).toEqual([{ path: "file.md", status: "deleted" }]);
  });

  it("treats a file modified in both the index and working tree as modified", () => {
    expect(parsePorcelainStatus("MM file.md\0")).toEqual([{ path: "file.md", status: "modified" }]);
  });

  it("parses a rename entry and skips its original-path field", () => {
    const output = "R  new.md\0old.md\0M  other.md\0";
    expect(parsePorcelainStatus(output)).toEqual([
      { path: "new.md", status: "renamed" },
      { path: "other.md", status: "modified" },
    ]);
  });

  it("parses multiple mixed entries", () => {
    const output = " M a.md\0?? b.md\0A  c.md\0";
    expect(parsePorcelainStatus(output)).toEqual([
      { path: "a.md", status: "modified" },
      { path: "b.md", status: "untracked" },
      { path: "c.md", status: "added" },
    ]);
  });
});
