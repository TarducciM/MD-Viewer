import { buildTree } from "./fileTree";
import { flattenFiles } from "./search";

export interface Backlink {
  path: string;
  line: number;
  text: string;
}

const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;

function basenameNoExt(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path;
  return name.replace(/\.[^.]+$/, "");
}

export async function findBacklinks(
  rootPath: string,
  rootName: string,
  targetPath: string,
  showHidden: boolean,
  readText: (path: string) => Promise<string | null>,
): Promise<Backlink[]> {
  const targetBase = basenameNoExt(targetPath).toLowerCase();
  if (!targetBase) return [];

  const tree = await buildTree(rootPath, rootName, showHidden);
  const results: Backlink[] = [];

  for (const file of flattenFiles(tree)) {
    if (file.path === targetPath) continue;
    const text = await readText(file.path);
    if (text === null) continue;

    const lines = text.split(/\r\n|\r|\n/);
    for (let i = 0; i < lines.length; i++) {
      WIKI_LINK_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = WIKI_LINK_RE.exec(lines[i]))) {
        const inner = match[1];
        const targetPart = (inner.split("|")[0] ?? inner).split("#")[0].trim().toLowerCase();
        if (targetPart === targetBase) {
          results.push({ path: file.path, line: i, text: lines[i].trim() });
        }
      }
    }
  }

  return results;
}
