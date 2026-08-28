import { getVersion } from "@tauri-apps/api/app";
import type { Settings } from "./settings";
import { applySettings, saveSettings } from "./settings";
import { applyTranslations, setLanguage, t } from "./i18n";
import { loadShortcuts, saveShortcuts, formatCombo, comboFromEvent, DEFAULT_SHORTCUTS } from "./shortcuts";

export interface SettingsPanelCallbacks {
  onLanguageChange: () => void;
  onShowHiddenChange: () => void;
  onAutoReloadChange: () => void;
  onShortcutsChange: () => void;
  getShortcutCommands: () => Array<{ id: string; label: string }>;
}

export function initSettingsPanel(settings: Settings, callbacks: SettingsPanelCallbacks): void {
  const overlay = document.querySelector<HTMLDivElement>("#settings-overlay")!;
  const openBtn = document.querySelector<HTMLButtonElement>("#settings-btn")!;
  const closeBtn = document.querySelector<HTMLButtonElement>("#settings-close-btn")!;
  const languageSelect = document.querySelector<HTMLSelectElement>("#setting-language")!;
  const themeSelect = document.querySelector<HTMLSelectElement>("#setting-theme")!;
  const fontSizeSelect = document.querySelector<HTMLSelectElement>("#setting-font-size")!;
  const codeSchemeSelect = document.querySelector<HTMLSelectElement>("#setting-code-scheme")!;
  const lineNumbersCheck = document.querySelector<HTMLInputElement>("#setting-line-numbers")!;
  const wordWrapCheck = document.querySelector<HTMLInputElement>("#setting-word-wrap")!;
  const autoReloadCheck = document.querySelector<HTMLInputElement>("#setting-auto-reload")!;
  const showHiddenCheck = document.querySelector<HTMLInputElement>("#setting-show-hidden")!;
  const versionEl = document.querySelector<HTMLDivElement>("#settings-version")!;
  const shortcutsList = document.querySelector<HTMLDivElement>("#settings-shortcuts-list")!;
  const shortcutsResetBtn = document.querySelector<HTMLButtonElement>("#setting-shortcuts-reset")!;

  let recordingId: string | null = null;

  function renderShortcuts(): void {
    const shortcuts = loadShortcuts();
    shortcutsList.innerHTML = "";
    for (const cmd of callbacks.getShortcutCommands()) {
      const row = document.createElement("div");
      row.className = "shortcut-row";

      const label = document.createElement("span");
      label.className = "shortcut-row-label";
      label.textContent = cmd.label;
      label.title = cmd.label;
      row.appendChild(label);

      const actions = document.createElement("div");
      actions.className = "shortcut-row-actions";

      const combo = shortcuts[cmd.id] ?? "";
      const comboBtn = document.createElement("button");
      comboBtn.type = "button";
      comboBtn.className = "shortcut-row-combo";
      comboBtn.textContent = combo ? formatCombo(combo) : t("settings.shortcuts.none");
      comboBtn.addEventListener("click", () => startRecording(cmd.id, comboBtn));
      actions.appendChild(comboBtn);

      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "shortcut-row-clear";
      clearBtn.textContent = "×";
      clearBtn.title = t("settings.shortcuts.clear");
      clearBtn.hidden = !combo;
      clearBtn.addEventListener("click", () => {
        const current = loadShortcuts();
        delete current[cmd.id];
        saveShortcuts(current);
        callbacks.onShortcutsChange();
        renderShortcuts();
      });
      actions.appendChild(clearBtn);

      row.appendChild(actions);
      shortcutsList.appendChild(row);
    }
  }

  function startRecording(id: string, btn: HTMLButtonElement): void {
    if (recordingId) return;
    recordingId = id;
    btn.classList.add("recording");
    btn.textContent = t("settings.shortcuts.recording");

    const cleanup = () => {
      window.removeEventListener("keydown", onKey, true);
      recordingId = null;
    };

    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        cleanup();
        renderShortcuts();
        return;
      }
      const combo = comboFromEvent(e);
      if (!combo) return;
      cleanup();

      const current = loadShortcuts();
      const conflictId = Object.keys(current).find((otherId) => otherId !== id && current[otherId] === combo);
      if (conflictId) {
        const conflictLabel = callbacks.getShortcutCommands().find((c) => c.id === conflictId)?.label ?? conflictId;
        const proceed = window.confirm(
          t("settings.shortcuts.conflict", { combo: formatCombo(combo), command: conflictLabel }),
        );
        if (!proceed) {
          renderShortcuts();
          return;
        }
        delete current[conflictId];
      }
      current[id] = combo;
      saveShortcuts(current);
      callbacks.onShortcutsChange();
      renderShortcuts();
    };

    window.addEventListener("keydown", onKey, true);
  }

  shortcutsResetBtn.addEventListener("click", () => {
    saveShortcuts({ ...DEFAULT_SHORTCUTS });
    callbacks.onShortcutsChange();
    renderShortcuts();
  });

  void getVersion()
    .then((version) => {
      versionEl.textContent = `MD Viewer v${version}`;
    })
    .catch(() => {});

  function syncInputs(): void {
    languageSelect.value = settings.language;
    themeSelect.value = settings.theme;
    fontSizeSelect.value = settings.fontSize;
    codeSchemeSelect.value = settings.codeColorScheme;
    lineNumbersCheck.checked = settings.lineNumbers;
    wordWrapCheck.checked = settings.wordWrap;
    autoReloadCheck.checked = settings.autoReload;
    showHiddenCheck.checked = settings.showHidden;
  }

  function open(): void {
    syncInputs();
    renderShortcuts();
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

  codeSchemeSelect.addEventListener("change", () => {
    settings.codeColorScheme = codeSchemeSelect.value as Settings["codeColorScheme"];
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
