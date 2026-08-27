import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { basicSetup } from "codemirror";

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
    fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, 'Courier New', monospace",
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
});

export interface MarkdownEditorHandle {
  getValue(): string;
  setValue(text: string): void;
  focus(): void;
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
        keymap.of([indentWithTab]),
        markdown({ codeLanguages: languages }),
        syntaxHighlighting(mdHighlightStyle),
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
    destroy: () => view.destroy(),
  };
}
