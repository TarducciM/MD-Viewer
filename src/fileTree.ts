import { readDir } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";

export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: TreeNode[];
}

const MD_EXTENSIONS = new Set(["md", "markdown", "mdown", "mkd"]);
const IGNORED_DIRS = new Set([
  "node_modules",
  "target",
  "dist",
  "build",
  ".git",
  ".svn",
  ".hg",
  ".vscode",
  ".idea",
]);

function isMarkdownFile(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return false;
  return MD_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

export async function buildTree(
  rootPath: string,
  rootName: string,
  includeHidden = false,
): Promise<TreeNode> {
  const root: TreeNode = { name: rootName, path: rootPath, isDir: true, children: [] };
  await scan(root, includeHidden);
  return root;
}

/** Populates node.children and returns true if the subtree contains at least one markdown file. */
async function scan(node: TreeNode, includeHidden: boolean): Promise<boolean> {
  let entries;
  try {
    entries = await readDir(node.path);
  } catch {
    node.children = [];
    return false;
  }

  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  const children: TreeNode[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) {
      const isDotDir = entry.name.startsWith(".");
      if ((isDotDir && !includeHidden) || IGNORED_DIRS.has(entry.name)) continue;
      const child: TreeNode = {
        name: entry.name,
        path: await join(node.path, entry.name),
        isDir: true,
        children: [],
      };
      if (await scan(child, includeHidden)) children.push(child);
    } else if (entry.isFile && isMarkdownFile(entry.name)) {
      children.push({
        name: entry.name,
        path: await join(node.path, entry.name),
        isDir: false,
      });
    }
  }
  node.children = children;
  return children.length > 0;
}

export function findFirstFile(node: TreeNode): TreeNode | null {
  if (!node.isDir) return node;
  for (const child of node.children ?? []) {
    const found = findFirstFile(child);
    if (found) return found;
  }
  return null;
}
