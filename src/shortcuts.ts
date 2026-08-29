const STORAGE_KEY = "mdviewer.shortcuts";

// "Mod" stands in for Ctrl (Cmd on macOS); kept distinct from a literal Ctrl
// so a single stored combo works across platforms and is easy to display.
export const DEFAULT_SHORTCUTS: Record<string, string> = {
  "open-file": "Mod+O",
  "open-folder": "Mod+Shift+O",
  save: "Mod+S",
  "close-tab": "Mod+W",
  "toggle-edit": "Mod+E",
  "open-palette": "Mod+Shift+P",
  "reopen-closed-tab": "Mod+Shift+T",
};

export function loadShortcuts(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SHORTCUTS };
    return { ...DEFAULT_SHORTCUTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SHORTCUTS };
  }
}

export function saveShortcuts(shortcuts: Record<string, string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
}

function normalizeKey(key: string): string {
  return key.length === 1 ? key.toUpperCase() : key;
}

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);

// Captures a keydown into a normalized combo string, or null while only a
// modifier is held (there's nothing meaningful to record yet).
export function comboFromEvent(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Mod");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  parts.push(normalizeKey(e.key));
  return parts.join("+");
}

export function matchesCombo(e: KeyboardEvent, combo: string): boolean {
  if (!combo) return false;
  const parts = combo.split("+");
  const key = parts[parts.length - 1];
  const mod = e.ctrlKey || e.metaKey;
  if (parts.includes("Mod") !== mod) return false;
  if (parts.includes("Shift") !== e.shiftKey) return false;
  if (parts.includes("Alt") !== e.altKey) return false;
  return normalizeKey(e.key) === key;
}

export function formatCombo(combo: string): string {
  return combo
    .split("+")
    .map((part) => (part === "Mod" ? "Ctrl" : part))
    .join("+");
}
