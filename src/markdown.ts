import MarkdownIt from "markdown-it";
// @ts-ignore - no type declarations shipped, see src/types.d.ts
import taskLists from "markdown-it-task-lists";
import hljs from "highlight.js";
import { convertFileSrc } from "@tauri-apps/api/core";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// hljs only ever emits `<span class="...">` and `</span>`, so a naive split on "\n"
// would leave unbalanced tags on lines that cross a token boundary (e.g. multi-line
// comments/strings). This re-splits the highlighted HTML into per-line strings,
// closing and reopening any span that's still open at each line break.
function splitHighlightedLines(html: string): string[] {
  const openTags: string[] = [];
  const tagRegex = /<span([^>]*)>|<\/span>/g;
  return html.split("\n").map((line) => {
    let out = openTags.map((attrs) => `<span${attrs}>`).join("");
    let lastIndex = 0;
    tagRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(line))) {
      out += line.slice(lastIndex, match.index);
      lastIndex = tagRegex.lastIndex;
      if (match[0] === "</span>") {
        openTags.pop();
        out += "</span>";
      } else {
        openTags.push(match[1]);
        out += match[0];
      }
    }
    out += line.slice(lastIndex) + "</span>".repeat(openTags.length);
    return out;
  });
}

function renderCodeBlock(code: string, lang?: string): string {
  const language = lang && hljs.getLanguage(lang) ? lang : undefined;
  let highlighted: string;
  try {
    highlighted = language ? hljs.highlight(code, { language }).value : hljs.highlightAuto(code).value;
  } catch {
    highlighted = escapeHtml(code);
  }

  const lines = splitHighlightedLines(highlighted);
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();

  const body = lines
    .map(
      (line, i) =>
        `<div class="code-line"><span class="line-no">${i + 1}</span><span class="line-content">${line}</span></div>`,
    )
    .join("");
  return `<pre class="hljs"><code>${body}</code></pre>`;
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight: renderCodeBlock,
});

md.use(taskLists, { enabled: true, label: true });

// Resolve a relative path against a base directory without the async path API,
// so it can run inside markdown-it's synchronous renderer rules.
function resolveRelativePath(baseDir: string, relative: string): string {
  const sep = baseDir.includes("\\") ? "\\" : "/";
  const baseParts = baseDir.split(/[\\/]/).filter((p) => p.length > 0);
  for (const part of relative.split(/[\\/]/)) {
    if (part === "" || part === ".") continue;
    if (part === "..") baseParts.pop();
    else baseParts.push(part);
  }
  return baseParts.join(sep);
}

function isRemoteOrData(src: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(src);
}

const defaultImageRenderer =
  md.renderer.rules.image ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const srcIndex = token.attrIndex("src");
  const baseDir = (env as { baseDir?: string }).baseDir;
  if (srcIndex >= 0 && baseDir) {
    const src = String(token.attrs![srcIndex][1]);
    if (!isRemoteOrData(src)) {
      const absolutePath = resolveRelativePath(baseDir, src);
      token.attrs![srcIndex][1] = convertFileSrc(absolutePath);
    }
  }
  return defaultImageRenderer(tokens, idx, options, env, self);
};

export function renderMarkdown(source: string, baseDir: string): string {
  return md.render(source, { baseDir });
}
