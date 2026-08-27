const STORAGE_KEY = "mdviewer.recents";
const MAX_RECENTS = 8;

export interface RecentEntry {
  path: string;
  isFolder: boolean;
  label: string;
}

function labelFor(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function getRecents(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function addRecent(path: string, isFolder: boolean): void {
  const existing = getRecents().filter((entry) => entry.path !== path);
  const next = [{ path, isFolder, label: labelFor(path) }, ...existing].slice(0, MAX_RECENTS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
