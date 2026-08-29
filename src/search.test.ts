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

const { searchInFiles, replaceInFiles } = await import("./search");

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

describe("replaceInFiles", () => {
  it("returns an empty list for a blank query", async () => {
    const written: Record<string, string> = {};
    const writeText = async (path: string, content: string) => {
      written[path] = content;
    };
    expect(await replaceInFiles("/root", "root", "  ", "x", false, readText, writeText)).toEqual([]);
    expect(written).toEqual({});
  });

  it("replaces case-insensitive matches and reports the count per file", async () => {
    const written: Record<string, string> = {};
    const writeText = async (path: string, content: string) => {
      written[path] = content;
    };
    const results = await replaceInFiles("/root", "root", "widgets", "gadgets", false, readText, writeText);
    const byPath = Object.fromEntries(results.map((r) => [r.path, r.count]));
    expect(byPath).toEqual({ "/root/guide.md": 1, "/root/docs/deep.md": 3 });
    expect(written["/root/guide.md"]).toBe("# Guide\n\nThis line mentions gadgets.\nAnother line.");
    expect(written["/root/docs/deep.md"]).toBe("gadgets and gadgets again\nsecond gadgets line");
  });

  it("does not write files with no match", async () => {
    const written: Record<string, string> = {};
    const writeText = async (path: string, content: string) => {
      written[path] = content;
    };
    await replaceInFiles("/root", "root", "widgets", "gadgets", false, readText, writeText);
    expect(written["/root/notes.md"]).toBeUndefined();
  });

  it("treats regex-special characters in the query literally", async () => {
    const contents: Record<string, string> = { "/root/guide.md": "cost: $5.00 (was $10.00)" };
    const readSpecial = async (path: string) => contents[path] ?? null;
    const written: Record<string, string> = {};
    const writeText = async (path: string, content: string) => {
      written[path] = content;
    };
    await replaceInFiles("/root", "root", "$5.00", "$7.00", false, readSpecial, writeText);
    expect(written["/root/guide.md"]).toBe("cost: $7.00 (was $10.00)");
  });
});
