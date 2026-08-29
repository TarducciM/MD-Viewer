const STORAGE_KEY = "mdviewer.favorites";
const MAX_FAVORITES = 30;

export interface FavoriteEntry {
  path: string;
  label: string;
}

function labelFor(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function getFavorites(): FavoriteEntry[] {
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

export function isFavorite(path: string): boolean {
  return getFavorites().some((entry) => entry.path === path);
}

export function addFavorite(path: string): void {
  if (isFavorite(path)) return;
  const next = [...getFavorites(), { path, label: labelFor(path) }].slice(0, MAX_FAVORITES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function removeFavorite(path: string): void {
  const next = getFavorites().filter((entry) => entry.path !== path);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function toggleFavorite(path: string): boolean {
  if (isFavorite(path)) {
    removeFavorite(path);
    return false;
  }
  addFavorite(path);
  return true;
}
