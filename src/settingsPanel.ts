import { getVersion } from "@tauri-apps/api/app";
import type { Settings } from "./settings";
import { applySettings, saveSettings } from "./settings";
import { applyTranslations, setLanguage } from "./i18n";

export interface SettingsPanelCallbacks {
  onLanguageChange: () => void;
  onShowHiddenChange: () => void;
  onAutoReloadChange: () => void;
}

export function initSettingsPanel(settings: Settings, callbacks: SettingsPanelCallbacks): void {
  const overlay = document.querySelector<HTMLDivElement>("#settings-overlay")!;
  const openBtn = document.querySelector<HTMLButtonElement>("#settings-btn")!;
  const closeBtn = document.querySelector<HTMLButtonElement>("#settings-close-btn")!;
  const languageSelect = document.querySelector<HTMLSelectElement>("#setting-language")!;
  const themeSelect = document.querySelector<HTMLSelectElement>("#setting-theme")!;
  const fontSizeSelect = document.querySelector<HTMLSelectElement>("#setting-font-size")!;
  const lineNumbersCheck = document.querySelector<HTMLInputElement>("#setting-line-numbers")!;
  const wordWrapCheck = document.querySelector<HTMLInputElement>("#setting-word-wrap")!;
  const autoReloadCheck = document.querySelector<HTMLInputElement>("#setting-auto-reload")!;
  const showHiddenCheck = document.querySelector<HTMLInputElement>("#setting-show-hidden")!;
  const versionEl = document.querySelector<HTMLDivElement>("#settings-version")!;

  void getVersion()
    .then((version) => {
      versionEl.textContent = `MD Viewer v${version}`;
    })
    .catch(() => {});

  function syncInputs(): void {
    languageSelect.value = settings.language;
    themeSelect.value = settings.theme;
    fontSizeSelect.value = settings.fontSize;
    lineNumbersCheck.checked = settings.lineNumbers;
    wordWrapCheck.checked = settings.wordWrap;
    autoReloadCheck.checked = settings.autoReload;
    showHiddenCheck.checked = settings.showHidden;
  }

  function open(): void {
    syncInputs();
    overlay.hidden = false;
  }

  function close(): void {
    overlay.hidden = true;
  }

  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) close();
  });

  languageSelect.addEventListener("change", () => {
    settings.language = languageSelect.value as Settings["language"];
    setLanguage(settings.language);
    saveSettings(settings);
    applyTranslations();
    callbacks.onLanguageChange();
  });

  themeSelect.addEventListener("change", () => {
    settings.theme = themeSelect.value as Settings["theme"];
    saveSettings(settings);
    applySettings(settings);
  });

  fontSizeSelect.addEventListener("change", () => {
    settings.fontSize = fontSizeSelect.value as Settings["fontSize"];
    saveSettings(settings);
    applySettings(settings);
  });

  lineNumbersCheck.addEventListener("change", () => {
    settings.lineNumbers = lineNumbersCheck.checked;
    saveSettings(settings);
    applySettings(settings);
  });

  wordWrapCheck.addEventListener("change", () => {
    settings.wordWrap = wordWrapCheck.checked;
    saveSettings(settings);
    applySettings(settings);
  });

  autoReloadCheck.addEventListener("change", () => {
    settings.autoReload = autoReloadCheck.checked;
    saveSettings(settings);
    callbacks.onAutoReloadChange();
  });

  showHiddenCheck.addEventListener("change", () => {
    settings.showHidden = showHiddenCheck.checked;
    saveSettings(settings);
    callbacks.onShowHiddenChange();
  });
}
