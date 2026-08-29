const STORAGE_KEY = "mdviewer.history";
const MAX_SNAPSHOTS_PER_FILE = 15;
const MAX_FILES = 50;

export interface Snapshot {
  timestamp: number;
  content: string;
}

type HistoryStore = Record<string, Snapshot[]>;

function loadStore(): HistoryStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveStore(store: HistoryStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getSnapshots(path: string): Snapshot[] {
  return loadStore()[path] ?? [];
}

export function addSnapshot(path: string, content: string, timestamp: number): void {
  const store = loadStore();
  const existing = store[path] ?? [];
  if (existing.length > 0 && existing[0].content === content) return;

  const next = [{ timestamp, content }, ...existing].slice(0, MAX_SNAPSHOTS_PER_FILE);
  delete store[path];
  const paths = Object.keys(store);
  if (paths.length >= MAX_FILES) {
    const oldestPath = paths.reduce((oldest, p) => {
      const oldestTime = store[oldest]?.[0]?.timestamp ?? 0;
      const pTime = store[p]?.[0]?.timestamp ?? 0;
      return pTime < oldestTime ? p : oldest;
    }, paths[0]);
    delete store[oldestPath];
  }
  store[path] = next;
  saveStore(store);
}

export function clearHistory(path: string): void {
  const store = loadStore();
  delete store[path];
  saveStore(store);
}
