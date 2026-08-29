import { buildTree, type TreeNode } from "./fileTree";

export interface SearchMatch {
  line: number;
  text: string;
}

export interface SearchResult {
  path: string;
  matches: SearchMatch[];
}

const MAX_MATCHES_PER_FILE = 20;

export function flattenFiles(node: TreeNode, out: TreeNode[] = []): TreeNode[] {
  if (node.isDir) {
    for (const child of node.children ?? []) flattenFiles(child, out);
  } else {
    out.push(node);
  }
  return out;
}

export async function searchInFiles(
  rootPath: string,
  rootName: string,
  query: string,
  showHidden: boolean,
  readText: (path: string) => Promise<string | null>,
): Promise<SearchResult[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const tree = await buildTree(rootPath, rootName, showHidden);
  const results: SearchResult[] = [];

  for (const file of flattenFiles(tree)) {
    const text = await readText(file.path);
    if (text === null) continue;
    const lines = text.split(/\r\n|\r|\n/);
    const matches: SearchMatch[] = [];
    for (let i = 0; i < lines.length && matches.length < MAX_MATCHES_PER_FILE; i++) {
      if (lines[i].toLowerCase().includes(needle)) {
        matches.push({ line: i, text: lines[i].trim() });
      }
    }
    if (matches.length > 0) results.push({ path: file.path, matches });
  }

  return results;
}

export interface ReplaceResult {
  path: string;
  count: number;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function replaceInFiles(
  rootPath: string,
  rootName: string,
  query: string,
  replacement: string,
  showHidden: boolean,
  readText: (path: string) => Promise<string | null>,
  writeText: (path: string, content: string) => Promise<void>,
): Promise<ReplaceResult[]> {
  const needle = query.trim();
  if (!needle) return [];

  const pattern = new RegExp(escapeRegExp(needle), "gi");
  const tree = await buildTree(rootPath, rootName, showHidden);
  const results: ReplaceResult[] = [];

  for (const file of flattenFiles(tree)) {
    const text = await readText(file.path);
    if (text === null) continue;
    const matches = text.match(pattern);
    if (!matches || matches.length === 0) continue;
    await writeText(file.path, text.replace(pattern, replacement));
    results.push({ path: file.path, count: matches.length });
  }

  return results;
}
