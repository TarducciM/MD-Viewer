function isTableRow(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line);
}

function isSeparatorRow(line: string): boolean {
  return /^\s*\|?[\s:-]+(\|[\s:-]+)*\|?\s*$/.test(line) && line.includes("-");
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|\s*$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function renderAsciiTable(header: string[], rows: string[][]): string {
  const colCount = header.length;
  const widths = Array.from({ length: colCount }, (_, i) =>
    Math.max(header[i]?.length ?? 0, ...rows.map((r) => (r[i] ?? "").length), 1),
  );

  const renderRow = (cells: string[]) =>
    "| " + widths.map((w, i) => (cells[i] ?? "").padEnd(w)).join(" | ") + " |";
  const renderRule = () => "+-" + widths.map((w) => "-".repeat(w)).join("-+-") + "-+";

  return [renderRule(), renderRow(header), renderRule(), ...rows.map(renderRow), renderRule()].join("\n");
}

/** Renders Markdown source as plain text, replacing tables with an aligned ASCII (box-drawing) grid. */
export function markdownToPlainText(source: string): string {
  const lines = source.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (isTableRow(lines[i]) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const header = parseTableRow(lines[i]);
      let j = i + 2;
      const rows: string[][] = [];
      while (j < lines.length && isTableRow(lines[j])) {
        rows.push(parseTableRow(lines[j]));
        j++;
      }
      out.push(renderAsciiTable(header, rows));
      i = j;
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  return out.join("\n");
}

/** Wraps already-rendered preview HTML into a self-contained document with the app's own styling. */
export function markdownToStandaloneHtml(bodyHtml: string, title: string, css: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(title)}</title>
<style>
body { margin: 0; background: #fff; }
${css}
</style>
</head>
<body>
<article class="markdown-body">
${bodyHtml}
</article>
</body>
</html>
`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const EXPORT_HTML_CSS = `
.markdown-body {
  max-width: 860px;
  margin: 40px auto;
  padding: 0 24px 80px;
  font-family: -apple-system, "Segoe UI", Arial, sans-serif;
  font-size: 16px;
  line-height: 1.65;
  color: #1f1f1f;
}
.markdown-body h1, .markdown-body h2, .markdown-body h3,
.markdown-body h4, .markdown-body h5, .markdown-body h6 {
  color: #000;
  font-weight: 600;
  margin: 1.4em 0 0.6em;
}
.markdown-body h1 { font-size: 1.9em; padding-bottom: 0.3em; border-bottom: 1px solid #d1d1d1; }
.markdown-body h2 { font-size: 1.5em; padding-bottom: 0.25em; border-bottom: 1px solid #e5e5e5; }
.markdown-body a { color: #2470b3; }
.markdown-body blockquote {
  margin: 0.7em 0; padding: 0.2em 1em; border-left: 3px solid #2470b3; color: #555;
}
.markdown-body code {
  font-family: Consolas, "Courier New", monospace; font-size: 0.9em;
  background: #f5f5f5; border: 1px solid #ddd; border-radius: 3px; padding: 0.1em 0.4em;
}
.markdown-body pre { background: #f5f5f5; border: 1px solid #ddd; border-radius: 6px; padding: 12px 16px; overflow-x: auto; }
.markdown-body pre code { background: none; border: none; padding: 0; }
.markdown-body table { border-collapse: collapse; width: 100%; }
.markdown-body th, .markdown-body td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
.markdown-body th { background: #f2f2f2; }
.markdown-body img { max-width: 100%; }
`;
