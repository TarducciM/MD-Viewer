# MD Viewer

Un visualizzatore di file Markdown per desktop, con un'interfaccia ispirata alle IDE JetBrains (tema Darcula scuro + tema chiaro IntelliJ Light).

## Funzionalità

- Sidebar con albero file, come il project tree di IntelliJ: apri una cartella e naviga tra i `.md` che contiene
- Rendering completo: titoli, liste, task-list, tabelle, blockquote, link, immagini locali, blocchi di codice con syntax highlighting ed evidenziazione fedele a Darcula / IntelliJ Light
- Numeri di riga e a capo automatico opzionali nei blocchi di codice
- Aggiornamento automatico dell'anteprima quando il file viene modificato su disco
- Tema scuro, chiaro o a seguire il sistema operativo
- Interfaccia in italiano o inglese
- Scorciatoie da tastiera: `Ctrl+O` per aprire un file, `Ctrl+Shift+O` per aprire una cartella

Il viewer non modifica i file: apre e mostra soltanto.

## Stack

- [Tauri 2](https://tauri.app/) (Rust + WebView2) per l'app desktop
- TypeScript vanilla + [Vite](https://vitejs.dev/), nessun framework UI
- [markdown-it](https://github.com/markdown-it/markdown-it) per il parsing e [highlight.js](https://highlightjs.org/) per la sintassi

## Sviluppo

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

Genera un eseguibile nativo in `src-tauri/target/release/`.

## Cartella di esempio

`samples/` contiene un paio di file `.md` di prova, utili per provare subito l'app dopo il primo avvio.
