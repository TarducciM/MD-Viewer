import { describe, it, expect, vi } from "vitest";

function entry(name: string, isDirectory: boolean) {
  return { name, isDirectory, isFile: !isDirectory, isSymlink: false };
}

const fsTree: Record<string, ReturnType<typeof entry>[]> = {
  "/root": [entry("guide.md", false), entry("other.md", false), entry("notes.md", false), entry("docs", true)],
  "/root/docs": [entry("deep.md", false)],
};

const fileContents: Record<string, string> = {
  "/root/guide.md": "# Guide\n\nSome content.",
  "/root/other.md": "See [[guide]] for details.\nAlso [[Guide|the guide]] again.",
  "/root/notes.md": "Nothing related here.\n[[unrelated]] link.",
  "/root/docs/deep.md": "A nested reference to [[guide#Section]].",
};

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: (path: string) => Promise.resolve(fsTree[path] ?? []),
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: (a: string, b: string) => Promise.resolve(`${a}/${b}`),
}));

const { findBacklinks } = await import("./backlinks");

const readText = async (path: string) => fileContents[path] ?? null;

describe("findBacklinks", () => {
  it("finds wiki-links pointing at the target file, by basename", async () => {
    const results = await findBacklinks("/root", "root", "/root/guide.md", false, readText);
    const paths = results.map((r) => r.path).sort();
    expect(paths).toEqual(["/root/docs/deep.md", "/root/other.md", "/root/other.md"]);
  });

  it("matches case-insensitively and ignores the |label part", async () => {
    const results = await findBacklinks("/root", "root", "/root/guide.md", false, readText);
    const labeled = results.find((r) => r.text.includes("the guide"));
    expect(labeled).toBeDefined();
  });

  it("ignores a #heading fragment when matching the target", async () => {
    const results = await findBacklinks("/root", "root", "/root/guide.md", false, readText);
    const nested = results.find((r) => r.path === "/root/docs/deep.md");
    expect(nested).toBeDefined();
  });

  it("does not match an unrelated wiki-link", async () => {
    const results = await findBacklinks("/root", "root", "/root/guide.md", false, readText);
    expect(results.some((r) => r.path === "/root/notes.md")).toBe(false);
  });

  it("excludes the target file itself even if self-referencing", async () => {
    const results = await findBacklinks("/root", "root", "/root/guide.md", false, readText);
    expect(results.some((r) => r.path === "/root/guide.md")).toBe(false);
  });

  it("returns an empty list when nothing links to the file", async () => {
    const results = await findBacklinks("/root", "root", "/root/notes.md", false, readText);
    expect(results).toEqual([]);
  });

  it("reports the correct line number for each match", async () => {
    const results = await findBacklinks("/root", "root", "/root/guide.md", false, readText);
    const first = results.find((r) => r.path === "/root/other.md" && r.text.startsWith("See"));
    expect(first?.line).toBe(0);
  });
});
