export type ThemeMode = "dark" | "light" | "system";
export type FontSize = "small" | "medium" | "large";
export type Language = "it" | "en";

export interface Settings {
  language: Language;
  theme: ThemeMode;
  fontSize: FontSize;
  wordWrap: boolean;
  lineNumbers: boolean;
  autoReload: boolean;
  showHidden: boolean;
}

const STORAGE_KEY = "mdviewer.settings";

export const DEFAULT_SETTINGS: Settings = {
  language: "it",
  theme: "dark",
  fontSize: "medium",
  wordWrap: false,
  lineNumbers: true,
  autoReload: true,
  showHidden: false,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function applySettings(settings: Settings): void {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.dataset.fontSize = settings.fontSize;
  root.classList.toggle("wrap-code", settings.wordWrap);
  root.classList.toggle("show-line-numbers", settings.lineNumbers);
}
