# MD Viewer

[🇮🇹 Italiano](#italiano) · [🇬🇧 English](#english)

---

## Italiano

Un visualizzatore di file Markdown per desktop, con un tema scuro e uno chiaro ispirati agli editor di codice, sidebar con albero dei file e una modalità di modifica opzionale.

### Funzionalità

- Sidebar con albero file: apri una cartella e naviga tra i `.md` che contiene
- Rendering completo: titoli, liste, task-list, tabelle, blockquote, link, immagini locali, blocchi di codice con syntax highlighting
- Numeri di riga e a capo automatico opzionali nei blocchi di codice
- Aggiornamento automatico dell'anteprima quando il file viene modificato su disco
- Tema scuro, chiaro o a seguire il sistema operativo
- Interfaccia in italiano o inglese
- Modalità di modifica opzionale, side-by-side (editor + anteprima live), con `Ctrl+E` per attivarla e `Ctrl+S` per salvare
- Scorciatoie: `Ctrl+O` per aprire un file, `Ctrl+Shift+O` per aprire una cartella

### Stack

- [Tauri 2](https://tauri.app/) (Rust + WebView2) per l'app desktop
- TypeScript vanilla + [Vite](https://vitejs.dev/), nessun framework UI
- [markdown-it](https://github.com/markdown-it/markdown-it) per il parsing e [highlight.js](https://highlightjs.org/) per la sintassi
- [CodeMirror 6](https://codemirror.net/) per la modalità di modifica
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

Genera un eseguibile nativo in `src-tauri/target/release/`. Pushando un tag `vX.Y.Z` parte anche una pipeline che builda per Windows, macOS e Linux e prepara una bozza di release su GitHub ([.github/workflows/release.yml](.github/workflows/release.yml)).

### Cartella di esempio

`samples/` contiene un paio di file `.md` di prova, utili per provare subito l'app dopo il primo avvio.

### Licenza

[MIT](LICENSE)

---

## English

A desktop Markdown viewer with a dark and a light theme inspired by code editors, a file-tree sidebar, and an optional editing mode.

### Features

- File-tree sidebar: open a folder and browse the `.md` files inside it
- Full rendering: headings, lists, task lists, tables, blockquotes, links, local images, syntax-highlighted code blocks
- Optional line numbers and word-wrap in code blocks
- Auto-reloads the preview when the file changes on disk
- Dark, light, or system theme
- Italian or English UI
- Optional side-by-side edit mode (editor + live preview), `Ctrl+E` to toggle, `Ctrl+S` to save
- Shortcuts: `Ctrl+O` to open a file, `Ctrl+Shift+O` to open a folder

### Stack

- [Tauri 2](https://tauri.app/) (Rust + WebView2) for the desktop shell
- Vanilla TypeScript + [Vite](https://vitejs.dev/), no UI framework
- [markdown-it](https://github.com/markdown-it/markdown-it) for parsing and [highlight.js](https://highlightjs.org/) for syntax highlighting
- [CodeMirror 6](https://codemirror.net/) for the edit mode
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

Produces a native executable under `src-tauri/target/release/`. Pushing a `vX.Y.Z` tag also kicks off a pipeline that builds for Windows, macOS, and Linux and drafts a GitHub release ([.github/workflows/release.yml](.github/workflows/release.yml)).

### Sample folder

`samples/` has a couple of sample `.md` files, handy for trying the app out right after the first launch.

### License

[MIT](LICENSE)
