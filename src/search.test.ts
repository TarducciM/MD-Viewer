import { describe, it, expect, vi } from "vitest";

function entry(name: string, isDirectory: boolean) {
  return { name, isDirectory, isFile: !isDirectory, isSymlink: false };
}

const fsTree: Record<string, ReturnType<typeof entry>[]> = {
  "/root": [entry("guide.md", false), entry("notes.md", false), entry("docs", true)],
  "/root/docs": [entry("deep.md", false)],
};

const fileContents: Record<string, string> = {
  "/root/guide.md": "# Guide\n\nThis line mentions Widgets.\nAnother line.",
  "/root/notes.md": "Nothing relevant here.\nStill nothing.",
  "/root/docs/deep.md": "widgets and WIDGETS again\nsecond widgets line",
};

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: (path: string) => Promise.resolve(fsTree[path] ?? []),
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: (a: string, b: string) => Promise.resolve(`${a}/${b}`),
}));

const { searchInFiles } = await import("./search");

const readText = async (path: string) => fileContents[path] ?? null;

describe("searchInFiles", () => {
  it("returns an empty list for a blank query", async () => {
    expect(await searchInFiles("/root", "root", "   ", false, readText)).toEqual([]);
  });

  it("matches case-insensitively across files, recursing into subdirectories", async () => {
    const results = await searchInFiles("/root", "root", "widgets", false, readText);
    const paths = results.map((r) => r.path).sort();
    expect(paths).toEqual(["/root/docs/deep.md", "/root/guide.md"]);
  });

  it("reports the matching line number and trimmed text", async () => {
    const results = await searchInFiles("/root", "root", "widgets", false, readText);
    const guide = results.find((r) => r.path === "/root/guide.md")!;
    expect(guide.matches).toEqual([{ line: 2, text: "This line mentions Widgets." }]);
  });

  it("collects every matching line within a file", async () => {
    const results = await searchInFiles("/root", "root", "widgets", false, readText);
    const deep = results.find((r) => r.path === "/root/docs/deep.md")!;
    expect(deep.matches).toHaveLength(2);
  });

  it("skips files with no match", async () => {
    const results = await searchInFiles("/root", "root", "widgets", false, readText);
    expect(results.some((r) => r.path === "/root/notes.md")).toBe(false);
  });
});
