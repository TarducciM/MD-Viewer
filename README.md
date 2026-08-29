# MD Viewer

[🇮🇹 Italiano](#italiano) · [🇬🇧 English](#english)

---

## Italiano

Un visualizzatore ed editor di file Markdown per desktop, con un tema scuro e uno chiaro ispirati agli editor di codice, sidebar con albero dei file e una modalità di modifica opzionale.

### Funzionalità

**Visualizzazione**

- Sidebar con albero file (sempre la stessa) e più tab per i file aperti contemporaneamente, ciascuna con il proprio stato, come in una IDE
- Barra menu File / Visualizza / Aiuto, toolbar con le icone e palette comandi (`Ctrl+Shift+P`) per richiamare qualsiasi azione da tastiera
- Rendering completo: titoli, liste, task-list, tabelle, blockquote, link, immagini locali, blocchi di codice con syntax highlighting e diagrammi Mermaid
- Wiki-link (`[[nota]]` o `[[nota|etichetta]]`) e pannello backlink con l'elenco dei file che rimandano a quello aperto
- Frontmatter YAML mostrato come scheda leggibile invece che come testo grezzo
- Numeri di riga e a capo automatico opzionali nei blocchi di codice
- Aggiornamento automatico dell'anteprima quando il file viene modificato su disco

**Modifica**

- Modalità di modifica opzionale, side-by-side (editor + anteprima live) con scorrimento sincronizzato, `Ctrl+E` per attivarla e `Ctrl+S` per salvare
- Toolbar di formattazione (grassetto, link, tabelle, liste, ecc.), navigazione smart nelle tabelle (Tab tra le celle, aggiunta rapida di righe/colonne) e autocompletamento parole italiano/inglese
- Incolla immagini dagli appunti direttamente nel testo: vengono salvate accanto al file e collegate automaticamente
- Vista divisa per affiancare due tab, con una modalità "differenze" per vedere le righe cambiate tra le due
- Modalità zen per nascondere tutti i pannelli e concentrarsi sul testo
- Riapri l'ultima tab chiusa per errore (`Ctrl+Shift+T`)

**Navigazione e ricerca**

- Pannello indice/outline con i titoli del documento, cliccabile per saltare alla sezione
- Ricerca full-text tra tutti i file della cartella aperta, con trova & sostituisci su più file contemporaneamente
- Preferiti, file recenti e cronologia locale delle modifiche per ogni file, con snapshot richiamabili in qualsiasi momento

**Gestione file e Git**

- Gestione file dalla sidebar: nuovo file, nuova cartella, rinomina, elimina
- Trascina file o cartelle sulla finestra per aprirli
- Pannello Git con branch corrente e stato dei file modificati per la cartella aperta
- Pannelli laterali (indice, Git, backlink) trascinabili e agganciabili a sinistra, destra o in basso allo schermo

**Personalizzazione**

- Tema scuro, chiaro o a seguire il sistema operativo, con diverse combinazioni di colori per la sintassi del codice
- Scorciatoie da tastiera completamente personalizzabili dalle impostazioni, con etichette e suggerimenti che si aggiornano di conseguenza
- Interfaccia in italiano o inglese
- Conteggio parole e tempo di lettura stimato in status bar

**Esportazione e formati**

- Esportazione in PDF (stampa), Word (.docx), testo semplice (con le tabelle convertite in griglie ASCII) e HTML
- Codifica del file (UTF-8, UTF-8 BOM, UTF-16 LE/BE) e fine riga (LF/CRLF) rilevati automaticamente e modificabili dalla status bar

**Aggiornamenti**

- Controllo, download e installazione degli aggiornamenti direttamente dall'app (menu Aiuto)

### Scorciatoie di base

`Ctrl+O` apre un file, `Ctrl+Shift+O` apre una cartella, `Ctrl+S` salva, `Ctrl+W` chiude il tab, `Ctrl+E` attiva/disattiva la modifica, `Ctrl+Shift+P` apre la palette comandi, `Ctrl+Shift+T` riapre l'ultima tab chiusa. Tutte rimappabili dalle impostazioni.

### Stack

- [Tauri 2](https://tauri.app/) (Rust + WebView2) per l'app desktop
- TypeScript vanilla + [Vite](https://vitejs.dev/), nessun framework UI
- [markdown-it](https://github.com/markdown-it/markdown-it) per il parsing e [highlight.js](https://highlightjs.org/) per la sintassi
- [Mermaid](https://mermaid.js.org/) per i diagrammi
- [CodeMirror 6](https://codemirror.net/) per la modalità di modifica
- [docx](https://github.com/dolanmiu/docx) per l'esportazione in Word
- [Vitest](https://vitest.dev/) per i test

### Sviluppo

```bash
npm install
npm run tauri dev
```

### Test

```bash
npm run typecheck
npm test
```

Girano automaticamente su ogni push/PR tramite GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)).

### Build e release

```bash
npm run tauri build
```

Genera un eseguibile nativo in `src-tauri/target/release/`. Pushando un tag `vX.Y.Z` parte una pipeline che ricontrolla typecheck/test/build, builda per Windows (installer, MSI e versione portable), macOS (Apple Silicon e Intel) e Linux (AppImage, .deb, .rpm), e pubblica una release su GitHub con tutti gli asset ([.github/workflows/release.yml](.github/workflows/release.yml)).

### Cartella di esempio

`samples/` contiene un paio di file `.md` di prova, utili per provare subito l'app dopo il primo avvio.

### Licenza

[MIT](LICENSE)

---

## English

A desktop Markdown viewer and editor with a dark and a light theme inspired by code editors, a file-tree sidebar, and an optional editing mode.

### Features

**Viewing**

- File-tree sidebar (always the same one) with multiple tabs for simultaneously open files, each with its own state, IDE-style
- File / View / Help menu bar, icon toolbar, and a command palette (`Ctrl+Shift+P`) to trigger any action from the keyboard
- Full rendering: headings, lists, task lists, tables, blockquotes, links, local images, syntax-highlighted code blocks, and Mermaid diagrams
- Wiki-links (`[[note]]` or `[[note|label]]`) and a backlinks panel listing which files link to the one that's open
- YAML frontmatter shown as a readable card instead of raw text
- Optional line numbers and word-wrap in code blocks
- Auto-reloads the preview when the file changes on disk

**Editing**

- Optional side-by-side edit mode (editor + live preview) with synced scrolling, `Ctrl+E` to toggle, `Ctrl+S` to save
- Formatting toolbar (bold, links, tables, lists, …), smart table navigation (Tab between cells, quick row/column insertion), and Italian/English word autocomplete
- Paste images straight from the clipboard into the text: they're saved next to the file and linked automatically
- Split view to place two tabs side by side, with a "differences" mode to see the changed lines between them
- Zen mode to hide every panel and focus on the text
- Reopen the last tab you closed by mistake (`Ctrl+Shift+T`)

**Navigation and search**

- Outline panel with the document's headings, click to jump to a section
- Full-text search across every file in the open folder, with find & replace across multiple files at once
- Favorites, recent files, and a local edit history per file, with snapshots you can restore anytime

**File management and Git**

- File management from the sidebar: new file, new folder, rename, delete
- Drag files or folders onto the window to open them
- Git panel with the current branch and modified-file status for the open folder
- Side panels (outline, Git, backlinks) are draggable and dockable to the left, right, or bottom of the window

**Customization**

- Dark, light, or system theme, with several color schemes for code syntax highlighting
- Fully remappable keyboard shortcuts, with labels and tooltips that update to match
- Italian or English UI
- Word count and estimated reading time in the status bar

**Export and formats**

- Export to PDF (print), Word (.docx), plain text (tables rendered as ASCII grids), and HTML
- File encoding (UTF-8, UTF-8 BOM, UTF-16 LE/BE) and line ending (LF/CRLF) auto-detected and changeable from the status bar

**Updates**

- Check for, download, and install updates straight from the app (Help menu)

### Core shortcuts

`Ctrl+O` opens a file, `Ctrl+Shift+O` opens a folder, `Ctrl+S` saves, `Ctrl+W` closes the tab, `Ctrl+E` toggles edit mode, `Ctrl+Shift+P` opens the command palette, `Ctrl+Shift+T` reopens the last closed tab. All remappable from settings.

### Stack

- [Tauri 2](https://tauri.app/) (Rust + WebView2) for the desktop shell
- Vanilla TypeScript + [Vite](https://vitejs.dev/), no UI framework
- [markdown-it](https://github.com/markdown-it/markdown-it) for parsing and [highlight.js](https://highlightjs.org/) for syntax highlighting
- [Mermaid](https://mermaid.js.org/) for diagrams
- [CodeMirror 6](https://codemirror.net/) for the edit mode
- [docx](https://github.com/dolanmiu/docx) for the Word export
- [Vitest](https://vitest.dev/) for tests

### Development

```bash
npm install
npm run tauri dev
```

### Tests

```bash
npm run typecheck
npm test
```

These run automatically on every push/PR via GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)).

### Build and release

```bash
npm run tauri build
```

Produces a native executable under `src-tauri/target/release/`. Pushing a `vX.Y.Z` tag kicks off a pipeline that re-runs typecheck/test/build, builds for Windows (installer, MSI, and a portable build), macOS (Apple Silicon and Intel), and Linux (AppImage, .deb, .rpm), and publishes a GitHub release with every asset ([.github/workflows/release.yml](.github/workflows/release.yml)).

### Sample folder

`samples/` has a couple of sample `.md` files, handy for trying the app out right after the first launch.

### License

[MIT](LICENSE)
