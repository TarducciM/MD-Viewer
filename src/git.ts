import { Command } from "@tauri-apps/plugin-shell";

export type GitFileStatusKind = "modified" | "added" | "deleted" | "untracked" | "renamed" | "other";

export interface GitFileStatus {
  path: string;
  status: GitFileStatusKind;
}

export interface GitStatusResult {
  isRepo: boolean;
  branch: string | null;
  files: GitFileStatus[];
}

function classify(x: string, y: string): GitFileStatusKind {
  if (x === "?" && y === "?") return "untracked";
  if (x === "R" || y === "R" || x === "C" || y === "C") return "renamed";
  if (x === "A" || y === "A") return "added";
  if (x === "D" || y === "D") return "deleted";
  if (x === "M" || y === "M") return "modified";
  return "other";
}

// `git status --porcelain=v1 -z`: NUL-separated "XY path" entries; a rename/copy
// entry is followed by an extra NUL-terminated field holding the original path.
export function parsePorcelainStatus(output: string): GitFileStatus[] {
  const parts = output.split("\0").filter((part) => part.length > 0);
  const files: GitFileStatus[] = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (entry.length < 3) continue;
    const status = classify(entry[0], entry[1]);
    files.push({ path: entry.slice(3), status });
    if (status === "renamed") i++;
  }
  return files;
}

export async function getGitStatus(rootPath: string): Promise<GitStatusResult> {
  try {
    const statusResult = await Command.create("git-status", [
      "-C",
      rootPath,
      "status",
      "--porcelain=v1",
      "-z",
    ]).execute();
    if (statusResult.code !== 0) return { isRepo: false, branch: null, files: [] };

    const branchResult = await Command.create("git-branch", ["-C", rootPath, "branch", "--show-current"]).execute();
    const branch = branchResult.code === 0 ? branchResult.stdout.trim() || null : null;

    return { isRepo: true, branch, files: parsePorcelainStatus(statusResult.stdout) };
  } catch {
    return { isRepo: false, branch: null, files: [] };
  }
}
