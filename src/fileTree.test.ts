import { describe, it, expect, vi } from "vitest";
import type { TreeNode } from "./fileTree";

function entry(name: string, isDirectory: boolean) {
  return { name, isDirectory, isFile: !isDirectory, isSymlink: false };
}

const fsTree: Record<string, ReturnType<typeof entry>[]> = {
  "/root": [
    entry("README.md", false),
    entry("notes.txt", false),
    entry(".git", true),
    entry("node_modules", true),
    entry(".archive", true),
    entry("docs", true),
  ],
  "/root/.git": [entry("notes.md", false)],
  "/root/node_modules": [entry("pkg", true)],
  "/root/node_modules/pkg": [entry("index.md", false)],
  "/root/.archive": [entry("old.md", false)],
  "/root/docs": [entry("guide.md", false), entry("empty-subdir", true), entry("nested", true)],
  "/root/docs/empty-subdir": [entry("readme.txt", false)],
  "/root/docs/nested": [entry("deep.MD", false)],
};

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: (path: string) => Promise.resolve(fsTree[path] ?? []),
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: (a: string, b: string) => Promise.resolve(`${a}/${b}`),
}));

const { buildTree, findFirstFile } = await import("./fileTree");

function names(node: TreeNode): string[] {
  return (node.children ?? []).map((c) => c.name);
}

describe("buildTree", () => {
  it("only includes markdown files, directories first then alphabetical", async () => {
    const tree = await buildTree("/root", "root");
    expect(names(tree)).toEqual(["docs", "README.md"]);
  });

  it("prunes always-ignored directories (.git, node_modules) even with hidden dirs shown", async () => {
    const tree = await buildTree("/root", "root", true);
    expect(names(tree)).not.toContain(".git");
    expect(names(tree)).not.toContain("node_modules");
  });

  it("hides dot-directories by default but shows them when includeHidden is true", async () => {
    const withoutHidden = await buildTree("/root", "root", false);
    expect(names(withoutHidden)).not.toContain(".archive");

    const withHidden = await buildTree("/root", "root", true);
    expect(names(withHidden)).toContain(".archive");
    const archive = withHidden.children!.find((c) => c.name === ".archive")!;
    expect(names(archive)).toEqual(["old.md"]);
  });

  it("prunes a subdirectory that contains no markdown files at all", async () => {
    const tree = await buildTree("/root", "root");
    const docs = tree.children!.find((c) => c.name === "docs")!;
    expect(names(docs)).not.toContain("empty-subdir");
  });

  it("recurses into nested directories and matches extensions case-insensitively", async () => {
    const tree = await buildTree("/root", "root");
    const docs = tree.children!.find((c) => c.name === "docs")!;
    const nested = docs.children!.find((c) => c.name === "nested")!;
    expect(names(nested)).toEqual(["deep.MD"]);
  });
});

describe("findFirstFile", () => {
  it("returns null for a directory with no files", () => {
    const empty: TreeNode = { name: "root", path: "/root", isDir: true, children: [] };
    expect(findFirstFile(empty)).toBeNull();
  });

  it("returns a leaf file node unchanged", () => {
    const file: TreeNode = { name: "a.md", path: "/root/a.md", isDir: false };
    expect(findFirstFile(file)).toBe(file);
  });

  it("finds the first file depth-first, in child order", () => {
    const tree: TreeNode = {
      name: "root",
      path: "/root",
      isDir: true,
      children: [
        { name: "empty-dir", path: "/root/empty-dir", isDir: true, children: [] },
        {
          name: "docs",
          path: "/root/docs",
          isDir: true,
          children: [{ name: "guide.md", path: "/root/docs/guide.md", isDir: false }],
        },
        { name: "top.md", path: "/root/top.md", isDir: false },
      ],
    };
    expect(findFirstFile(tree)?.path).toBe("/root/docs/guide.md");
  });
});
