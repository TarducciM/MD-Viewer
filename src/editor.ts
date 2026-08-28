import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { basicSetup } from "codemirror";
import { COMMON_WORDS } from "./wordlists";

const mdHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "var(--text-bright)", fontWeight: "600" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: "var(--link)" },
  { tag: tags.monospace, color: "var(--text)", fontFamily: "inherit" },
  { tag: tags.quote, color: "var(--text-muted)", fontStyle: "italic" },
  { tag: [tags.list, tags.processingInstruction], color: "var(--syn-number)" },
  { tag: tags.keyword, color: "var(--syn-keyword)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--syn-string)" },
  { tag: tags.number, color: "var(--syn-number)" },
  { tag: [tags.className, tags.typeName], color: "var(--syn-title)" },
  { tag: [tags.propertyName, tags.attributeName, tags.variableName], color: "var(--syn-attr)" },
  { tag: tags.comment, color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: tags.meta, color: "var(--syn-meta)" },
]);

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "13.5px",
    color: "var(--text)",
    backgroundColor: "var(--bg-editor)",
  },
  ".cm-scroller": {
    fontFamily: "'Cascadia Code', 'Fira Code', Consolas, 'Courier New', monospace",
    lineHeight: "1.6",
  },
  ".cm-content": {
    caretColor: "var(--text-bright)",
    padding: "12px 0",
  },
  ".cm-gutters": {
    backgroundColor: "var(--bg-editor)",
    color: "var(--text-muted)",
    border: "none",
    borderRight: "1px solid var(--border)",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--bg-hover)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--bg-hover)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--bg-selected) 35%, transparent)",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--text-bright)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--bg-panel)",
    border: "1px solid var(--border-soft)",
    color: "var(--text)",
  },
  ".cm-tooltip-autocomplete ul li": {
    padding: "3px 8px",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--bg-selected)",
    color: "#fff",
  },
  ".cm-completionIcon": {
    display: "none",
  },
});

const WORD_PATTERN = /[\p{L}][\p{L}'-]*/u;
const MIN_PREFIX_LENGTH = 2;
const MAX_SUGGESTIONS = 8;

function wordSuggestions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(WORD_PATTERN);
  if (!word || word.text.length < MIN_PREFIX_LENGTH) return null;
  if (word.from === word.to && !context.explicit) return null;

  const prefix = word.text.toLowerCase();
  const seen = new Set<string>([prefix]);
  const fromDoc: string[] = [];
  const fromDictionary: string[] = [];

  for (const match of context.state.doc.toString().matchAll(/[\p{L}][\p{L}'-]{2,}/gu)) {
    const key = match[0].toLowerCase();
    if (!key.startsWith(prefix) || seen.has(key)) continue;
    seen.add(key);
    fromDoc.push(match[0]);
  }

  for (const candidate of COMMON_WORDS) {
    const key = candidate.toLowerCase();
    if (!key.startsWith(prefix) || seen.has(key)) continue;
    seen.add(key);
    fromDictionary.push(candidate);
  }

  const options = [
    ...fromDoc.map((label) => ({ label, type: "text", boost: 2 })),
    ...fromDictionary.map((label) => ({ label, type: "text" })),
  ].slice(0, MAX_SUGGESTIONS);

  if (!options.length) return null;
  return { from: word.from, options, validFor: WORD_PATTERN };
}

export type FormatAction =
  | "bold"
  | "italic"
  | "strikethrough"
  | "heading"
  | "link"
  | "image"
  | "code"
  | "codeBlock"
  | "bulletList"
  | "numberedList"
  | "taskList"
  | "blockquote"
  | "table"
  | "tableAddRow"
  | "tableAddColumn"
  | "hr";

// --- Table cell navigation & editing --------------------------------------

const TABLE_ROW_RE = /^\s*\|/;

function isTableSeparatorLine(text: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(text) && text.includes("-");
}

interface TableCell {
  from: number;
  to: number;
}

// Requires the "| a | b |" leading+trailing-pipe form the app's own table
// template uses; cells with an escaped `\|` aren't handled (rare in practice).
function tableRowCells(line: { text: string; from: number }): TableCell[] {
  const segments = line.text.split("|");
  const cells: TableCell[] = [];
  let offset = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (i > 0 && i < segments.length - 1) {
      cells.push({ from: line.from + offset, to: line.from + offset + seg.length });
    }
    offset += seg.length + 1;
  }
  return cells;
}

function findCellIndex(cells: TableCell[], pos: number): number {
  for (let i = 0; i < cells.length; i++) {
    if (pos >= cells[i].from && pos <= cells[i].to) return i;
  }
  return -1;
}

// Walks to the next/previous row of the same table, skipping the `| --- |`
// separator row (there's nothing useful to tab into there).
function adjacentTableLine(state: EditorState, lineNumber: number, direction: 1 | -1): number | null {
  const total = state.doc.lines;
  let n = lineNumber + direction;
  while (n >= 1 && n <= total) {
    const text = state.doc.line(n).text;
    if (!TABLE_ROW_RE.test(text)) return null;
    if (!isTableSeparatorLine(text)) return n;
    n += direction;
  }
  return null;
}

function selectCell(view: EditorView, cell: TableCell): void {
  view.dispatch({ selection: { anchor: cell.from, head: cell.to } });
}

// Tab/Shift-Tab cell-to-cell navigation; returns false to fall through to
// normal indent handling when the cursor isn't inside a table row.
function handleTableTab(view: EditorView, direction: 1 | -1): boolean {
  const { state } = view;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  if (!TABLE_ROW_RE.test(line.text) || isTableSeparatorLine(line.text)) return false;

  const cells = tableRowCells(line);
  if (cells.length === 0) return false;
  const idx = findCellIndex(cells, pos);
  const currentIdx = idx === -1 ? (direction === 1 ? -1 : cells.length) : idx;
  const targetIdx = currentIdx + direction;

  if (targetIdx >= 0 && targetIdx < cells.length) {
    selectCell(view, cells[targetIdx]);
    return true;
  }

  if (direction === 1) {
    const nextLineNum = adjacentTableLine(state, line.number, 1);
    if (nextLineNum !== null) {
      const nextCells = tableRowCells(state.doc.line(nextLineNum));
      if (nextCells.length > 0) {
        selectCell(view, nextCells[0]);
        return true;
      }
    }
    const columnCount = cells.length;
    const insertAt = line.to;
    const cursorPos = insertAt + 2;
    view.dispatch({
      changes: { from: insertAt, to: insertAt, insert: "\n" + "|".repeat(columnCount + 1) },
      selection: { anchor: cursorPos, head: cursorPos },
    });
    return true;
  }

  const prevLineNum = adjacentTableLine(state, line.number, -1);
  if (prevLineNum !== null) {
    const prevCells = tableRowCells(state.doc.line(prevLineNum));
    if (prevCells.length > 0) selectCell(view, prevCells[prevCells.length - 1]);
  }
  return true;
}

function findTableBounds(state: EditorState, pos: number): { fromLine: number; toLine: number } | null {
  const startLine = state.doc.lineAt(pos);
  if (!TABLE_ROW_RE.test(startLine.text)) return null;
  let fromLine = startLine.number;
  while (fromLine > 1 && TABLE_ROW_RE.test(state.doc.line(fromLine - 1).text)) fromLine--;
  let toLine = startLine.number;
  const total = state.doc.lines;
  while (toLine < total && TABLE_ROW_RE.test(state.doc.line(toLine + 1).text)) toLine++;
  return { fromLine, toLine };
}

function addTableRow(view: EditorView): void {
  const { state } = view;
  const bounds = findTableBounds(state, state.selection.main.head);
  if (!bounds) return;
  const lastLine = state.doc.line(bounds.toLine);
  const columnCount = tableRowCells(lastLine).length;
  if (columnCount === 0) return;
  const insertAt = lastLine.to;
  const cursorPos = insertAt + 2;
  view.dispatch({
    changes: { from: insertAt, to: insertAt, insert: "\n" + "|".repeat(columnCount + 1) },
    selection: { anchor: cursorPos, head: cursorPos },
  });
  view.focus();
}

function addTableColumn(view: EditorView): void {
  const { state } = view;
  const bounds = findTableBounds(state, state.selection.main.head);
  if (!bounds) return;
  const changes = [];
  for (let n = bounds.fromLine; n <= bounds.toLine; n++) {
    const line = state.doc.line(n);
    const addition = isTableSeparatorLine(line.text) ? " --- |" : "  |";
    changes.push({ from: line.to, to: line.to, insert: addition });
  }
  view.dispatch({ changes });
  view.focus();
}

function applyFormat(view: EditorView, action: FormatAction): void {
  const { state } = view;
  const range = state.selection.main;
  const selectedText = state.sliceDoc(range.from, range.to);

  function wrapSelection(before: string, after: string, placeholder: string): void {
    const text = selectedText || placeholder;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: `${before}${text}${after}` },
      selection: { anchor: range.from + before.length, head: range.from + before.length + text.length },
    });
    view.focus();
  }

  function toggleLinePrefix(prefix: string): void {
    const line = state.doc.lineAt(range.from);
    const insert = line.text.startsWith(prefix) ? line.text.slice(prefix.length) : prefix + line.text;
    view.dispatch({ changes: { from: line.from, to: line.to, insert } });
    view.focus();
  }

  function insertLinkLike(bang: string, placeholder: string): void {
    const text = selectedText || placeholder;
    const insert = `${bang}[${text}](url)`;
    const urlFrom = range.from + bang.length + text.length + 3;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert },
      selection: { anchor: urlFrom, head: urlFrom + 3 },
    });
    view.focus();
  }

  // `template` may contain one \0 marking where the cursor should land after insertion.
  // Block-level constructs (tables, headings, thematic breaks) need a full blank line
  // before them, or Markdown reinterprets them as part of the previous paragraph
  // (e.g. "text" immediately followed by "---" becomes a setext heading, not a rule).
  function insertBlock(template: string): void {
    const insertAt = state.doc.lineAt(range.from).to;
    const withPrefix = (insertAt > 0 ? "\n\n" : "") + template;
    const markerIndex = withPrefix.indexOf("\0");
    const insert = withPrefix.replace("\0", "");
    const cursorPos = insertAt + (markerIndex === -1 ? insert.length : markerIndex);
    view.dispatch({ changes: { from: insertAt, to: insertAt, insert }, selection: { anchor: cursorPos } });
    view.focus();
  }

  switch (action) {
    case "bold":
      wrapSelection("**", "**", "testo");
      break;
    case "italic":
      wrapSelection("*", "*", "testo");
      break;
    case "strikethrough":
      wrapSelection("~~", "~~", "testo");
      break;
    case "code":
      wrapSelection("`", "`", "code");
      break;
    case "heading":
      toggleLinePrefix("## ");
      break;
    case "bulletList":
      toggleLinePrefix("- ");
      break;
    case "numberedList":
      toggleLinePrefix("1. ");
      break;
    case "taskList":
      toggleLinePrefix("- [ ] ");
      break;
    case "blockquote":
      toggleLinePrefix("> ");
      break;
    case "link":
      insertLinkLike("", "testo");
      break;
    case "image":
      insertLinkLike("!", "alt");
      break;
    case "hr":
      insertBlock("---\n\n\0");
      break;
    case "codeBlock":
      insertBlock("```\n\0\n```");
      break;
    case "table":
      insertBlock("| Col 1 | Col 2 |\n| --- | --- |\n| A | B |\n\n\0");
      break;
    case "tableAddRow":
      addTableRow(view);
      break;
    case "tableAddColumn":
      addTableColumn(view);
      break;
  }
}

export interface MarkdownEditorHandle {
  getValue(): string;
  setValue(text: string): void;
  focus(): void;
  format(action: FormatAction): void;
  destroy(): void;
}

const SYNC_SCROLL_DEBOUNCE_MS = 50;

export function createMarkdownEditor(
  container: HTMLElement,
  initialText: string,
  onChange: (text: string) => void,
  onScroll?: (topLine: number) => void,
  onImagePaste?: (blob: Blob) => Promise<string | null>,
): MarkdownEditorHandle {
  const view = new EditorView({
    state: EditorState.create({
      doc: initialText,
      extensions: [
        basicSetup,
        keymap.of([
          { key: "Tab", run: (v) => handleTableTab(v, 1) },
          { key: "Shift-Tab", run: (v) => handleTableTab(v, -1) },
          indentWithTab,
          { key: "Mod-b", run: (v) => (applyFormat(v, "bold"), true) },
          { key: "Mod-i", run: (v) => (applyFormat(v, "italic"), true) },
          { key: "Mod-k", run: (v) => (applyFormat(v, "link"), true) },
        ]),
        markdown({ codeLanguages: languages }),
        syntaxHighlighting(mdHighlightStyle),
        autocompletion({ override: [wordSuggestions], activateOnTyping: true }),
        EditorView.lineWrapping,
        editorTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString());
        }),
      ],
    }),
    parent: container,
  });

  let scrollTimer: ReturnType<typeof setTimeout> | null = null;
  const handleScroll = onScroll
    ? () => {
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          const topPos = view.lineBlockAtHeight(view.scrollDOM.scrollTop).from;
          onScroll(view.state.doc.lineAt(topPos).number - 1);
        }, SYNC_SCROLL_DEBOUNCE_MS);
      }
    : null;
  if (handleScroll) view.scrollDOM.addEventListener("scroll", handleScroll);

  const handlePaste = onImagePaste
    ? (event: ClipboardEvent) => {
        const item = Array.from(event.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
        const file = item?.getAsFile();
        if (!file) return;
        event.preventDefault();
        onImagePaste(file).then((markdown) => {
          if (!markdown) return;
          const pos = view.state.selection.main.from;
          view.dispatch({
            changes: { from: pos, to: pos, insert: markdown },
            selection: { anchor: pos + markdown.length },
          });
          view.focus();
        });
      }
    : null;
  if (handlePaste) view.dom.addEventListener("paste", handlePaste);

  return {
    getValue: () => view.state.doc.toString(),
    setValue: (text: string) => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    },
    focus: () => view.focus(),
    format: (action: FormatAction) => applyFormat(view, action),
    destroy: () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      if (handleScroll) view.scrollDOM.removeEventListener("scroll", handleScroll);
      if (handlePaste) view.dom.removeEventListener("paste", handlePaste);
      view.destroy();
    },
  };
}
