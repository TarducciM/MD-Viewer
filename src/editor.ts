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
  | "hr";

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
  }
}

export interface MarkdownEditorHandle {
  getValue(): string;
  setValue(text: string): void;
  focus(): void;
  format(action: FormatAction): void;
  destroy(): void;
}

export function createMarkdownEditor(
  container: HTMLElement,
  initialText: string,
  onChange: (text: string) => void,
): MarkdownEditorHandle {
  const view = new EditorView({
    state: EditorState.create({
      doc: initialText,
      extensions: [
        basicSetup,
        keymap.of([
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

  return {
    getValue: () => view.state.doc.toString(),
    setValue: (text: string) => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    },
    focus: () => view.focus(),
    format: (action: FormatAction) => applyFormat(view, action),
    destroy: () => view.destroy(),
  };
}
