import type { Language } from "./settings";

type Dict = Record<string, string>;

const it: Dict = {
  "toolbar.openFolder": "Apri cartella",
  "toolbar.openFolder.title": "Apri cartella (Ctrl+Shift+O)",
  "toolbar.openFile": "Apri file",
  "toolbar.openFile.title": "Apri file (Ctrl+O)",
  "toolbar.settings.title": "Impostazioni",
  "toolbar.edit.title": "Modifica (Ctrl+E)",
  "toolbar.edit.exit.title": "Esci dalla modifica (Ctrl+E)",
  "edit.confirmDiscard": "Ci sono modifiche non salvate. Vuoi scartarle?",
  "sidebar.placeholder": "PROGETTO",
  "empty.title": "Nessun file aperto",
  "empty.subtitle": "Apri una cartella per esplorare i file Markdown, oppure apri direttamente un file.",
  "status.scanning": "Scansione della cartella…",
  "status.noMarkdown": "Nessun file Markdown trovato in questa cartella.",
  "status.openError": "Impossibile aprire il file: {error}",
  "settings.title": "Impostazioni",
  "settings.language": "Lingua",
  "settings.theme": "Tema",
  "settings.theme.dark": "Scuro",
  "settings.theme.light": "Chiaro",
  "settings.theme.system": "Segui il sistema",
  "settings.fontSize": "Dimensione testo anteprima",
  "settings.fontSize.small": "Piccolo",
  "settings.fontSize.medium": "Medio",
  "settings.fontSize.large": "Grande",
  "settings.wordWrap": "A capo automatico nel codice",
  "settings.lineNumbers": "Numeri di riga nel codice",
  "settings.autoReload": "Aggiorna automaticamente se il file cambia",
  "settings.showHidden": "Mostra cartelle nascoste (.git, node_modules, …)",
  "settings.close": "Chiudi",
  "toolbar.export.title": "Esporta",
  "export.pdf": "PDF (stampa)",
  "export.docx": "Word (.docx)",
  "export.txt": "Testo semplice (.txt)",
  "export.html": "HTML",
  "status.encoding.title": "Codifica del file",
  "status.lineEnding.title": "Fine riga",
  "menu.file": "File",
  "menu.view": "Visualizza",
  "menu.help": "Aiuto",
  "menu.openFile": "Apri file… (Ctrl+O)",
  "menu.openFolder": "Apri cartella… (Ctrl+Shift+O)",
  "menu.save": "Salva (Ctrl+S)",
  "menu.closeTab": "Chiudi tab (Ctrl+W)",
  "menu.export": "Esporta",
  "menu.toggleSidebar": "Mostra/nascondi sidebar",
  "menu.theme": "Tema",
  "menu.settings": "Impostazioni…",
  "menu.repo": "Repository su GitHub",
  "tab.closeTitle": "Chiudi tab",
};

const en: Dict = {
  "toolbar.openFolder": "Open folder",
  "toolbar.openFolder.title": "Open folder (Ctrl+Shift+O)",
  "toolbar.openFile": "Open file",
  "toolbar.openFile.title": "Open file (Ctrl+O)",
  "toolbar.settings.title": "Settings",
  "toolbar.edit.title": "Edit (Ctrl+E)",
  "toolbar.edit.exit.title": "Exit edit mode (Ctrl+E)",
  "edit.confirmDiscard": "There are unsaved changes. Discard them?",
  "sidebar.placeholder": "PROJECT",
  "empty.title": "No file open",
  "empty.subtitle": "Open a folder to browse its Markdown files, or open a single file directly.",
  "status.scanning": "Scanning folder…",
  "status.noMarkdown": "No Markdown files found in this folder.",
  "status.openError": "Could not open file: {error}",
  "settings.title": "Settings",
  "settings.language": "Language",
  "settings.theme": "Theme",
  "settings.theme.dark": "Dark",
  "settings.theme.light": "Light",
  "settings.theme.system": "Follow system",
  "settings.fontSize": "Preview text size",
  "settings.fontSize.small": "Small",
  "settings.fontSize.medium": "Medium",
  "settings.fontSize.large": "Large",
  "settings.wordWrap": "Wrap long lines in code blocks",
  "settings.lineNumbers": "Show line numbers in code blocks",
  "settings.autoReload": "Auto-reload when the file changes on disk",
  "settings.showHidden": "Show hidden folders (.git, node_modules, …)",
  "settings.close": "Close",
  "toolbar.export.title": "Export",
  "export.pdf": "PDF (print)",
  "export.docx": "Word (.docx)",
  "export.txt": "Plain text (.txt)",
  "export.html": "HTML",
  "status.encoding.title": "File encoding",
  "status.lineEnding.title": "Line ending",
  "menu.file": "File",
  "menu.view": "View",
  "menu.help": "Help",
  "menu.openFile": "Open file… (Ctrl+O)",
  "menu.openFolder": "Open folder… (Ctrl+Shift+O)",
  "menu.save": "Save (Ctrl+S)",
  "menu.closeTab": "Close tab (Ctrl+W)",
  "menu.export": "Export",
  "menu.toggleSidebar": "Toggle sidebar",
  "menu.theme": "Theme",
  "menu.settings": "Settings…",
  "menu.repo": "Repository on GitHub",
  "tab.closeTitle": "Close tab",
};

const dictionaries: Record<Language, Dict> = { it, en };

let current: Language = "it";

export function setLanguage(lang: Language): void {
  current = lang;
}

export function getLanguage(): Language {
  return current;
}

export function t(key: string, vars?: Record<string, string>): string {
  let text = dictionaries[current][key] ?? dictionaries.it[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replace(`{${name}}`, value);
    }
  }
  return text;
}

export function applyTranslations(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n!);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle!);
  });
}
