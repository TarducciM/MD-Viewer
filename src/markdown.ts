import MarkdownIt, { type StateInline } from "markdown-it";
// @ts-ignore - no type declarations shipped, see src/types.d.ts
import taskLists from "markdown-it-task-lists";
import hljs from "highlight.js";
import { convertFileSrc } from "@tauri-apps/api/core";
import { parseFrontmatter, type FrontmatterValue } from "./frontmatter";

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// hljs only ever emits `<span class="...">` and `</span>`, so a naive split on "\n"
// would leave unbalanced tags on lines that cross a token boundary (e.g. multi-line
// comments/strings). This re-splits the highlighted HTML into per-line strings,
// closing and reopening any span that's still open at each line break.
export function splitHighlightedLines(html: string): string[] {
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

// Deterministic (not incremental) so the same diagram text always maps to the
// same id across re-renders, avoiding stale async mermaid.render() results
// from a previous render clobbering a same-numbered placeholder in a new one.
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

// Keyed by id, populated as a side effect of rendering; consumed by
// renderMermaidBlocks() after the HTML is inserted into the DOM, since
// mermaid.render() is async and can't run inside markdown-it's sync renderer.
export const mermaidSources = new Map<string, string>();

function renderCodeBlock(code: string, lang?: string): string {
  if (lang === "mermaid") {
    const id = `mermaid-${hashString(code)}`;
    mermaidSources.set(id, code);
    return `<div class="mermaid-block" data-mermaid-id="${id}"><pre class="mermaid-fallback">${escapeHtml(code)}</pre></div>`;
  }

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

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

// `[[target]]` or `[[target|label]]` — resolved to an actual file by the app
// at click time (see resolveWikiTarget in main.ts), not at render time.
function wikiLinkRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  if (state.src.slice(start, start + 2) !== "[[") return false;

  const end = state.src.indexOf("]]", start + 2);
  if (end === -1) return false;

  const inner = state.src.slice(start + 2, end);
  if (!inner || inner.includes("\n")) return false;

  const pipeIndex = inner.indexOf("|");
  const target = (pipeIndex === -1 ? inner : inner.slice(0, pipeIndex)).trim();
  if (!target) return false;

  if (!silent) {
    const label = pipeIndex === -1 ? target : inner.slice(pipeIndex + 1).trim();
    const token = state.push("wikilink", "a", 0);
    token.attrSet("data-wiki-target", target);
    token.content = label || target;
  }

  state.pos = end + 2;
  return true;
}

md.inline.ruler.before("link", "wikilink", wikiLinkRule);
md.renderer.rules.wikilink = (tokens, idx) => {
  const token = tokens[idx];
  const target = String(token.attrGet("data-wiki-target") ?? "");
  return `<a class="wiki-link" data-wiki-target="${escapeAttr(target)}">${escapeHtml(token.content)}</a>`;
};

// Resolve a relative path against a base directory without the async path API,
// so it can run inside markdown-it's synchronous renderer rules.
export function resolveRelativePath(baseDir: string, relative: string): string {
  const sep = baseDir.includes("\\") ? "\\" : "/";
  const isPosixAbsolute = baseDir.startsWith("/");
  const baseParts = baseDir.split(/[\\/]/).filter((p) => p.length > 0);
  for (const part of relative.split(/[\\/]/)) {
    if (part === "" || part === ".") continue;
    if (part === "..") baseParts.pop();
    else baseParts.push(part);
  }
  const joined = baseParts.join(sep);
  return isPosixAbsolute ? sep + joined : joined;
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

// GitHub-style slug: lowercase, strip punctuation, spaces to hyphens, dedup
// duplicates with a numeric suffix (scoped to a single counts map per render).
function slugify(text: string, counts: Map<string, number>): string {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
  const count = counts.get(base) ?? 0;
  counts.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

const defaultHeadingOpen =
  md.renderer.rules.heading_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
  const inlineToken = tokens[idx + 1];
  const envObj = env as { slugCounts?: Map<string, number> };
  if (!envObj.slugCounts) envObj.slugCounts = new Map();
  const slug = slugify(inlineToken ? inlineToken.content : "", envObj.slugCounts);
  tokens[idx].attrSet("id", slug);
  return defaultHeadingOpen(tokens, idx, options, env, self);
};

// Tags block-level elements with their source line so the outline panel and
// editor sync-scroll can map a preview element back to a line in the source.
const defaultRenderToken = md.renderer.renderToken.bind(md.renderer);
md.renderer.renderToken = (tokens, idx, options) => {
  const token = tokens[idx];
  if (token.nesting === 1 && token.block && token.map) {
    token.attrSet("data-line", String(token.map[0]));
  }
  return defaultRenderToken(tokens, idx, options);
};

// Blanks out the frontmatter block's lines (keeping the same line count) so
// content after it keeps the source line numbers that data-line/outline rely on.
function blankFrontmatterLines(source: string, lineCount: number): string {
  const lines = source.split("\n");
  for (let i = 0; i < lineCount; i++) lines[i] = "";
  return lines.join("\n");
}

function renderFrontmatterValue(value: FrontmatterValue): string {
  if (Array.isArray(value)) {
    return value.map((item) => `<span class="frontmatter-tag">${escapeHtml(item)}</span>`).join("");
  }
  return `<span class="frontmatter-text">${escapeHtml(String(value))}</span>`;
}

function renderFrontmatterCard(data: Record<string, FrontmatterValue>): string {
  const keys = Object.keys(data);
  if (keys.length === 0) return "";
  const rows = keys
    .map(
      (key) =>
        `<div class="frontmatter-row"><span class="frontmatter-key">${escapeHtml(key)}</span>${renderFrontmatterValue(data[key])}</div>`,
    )
    .join("");
  return `<div class="frontmatter-card">${rows}</div>`;
}

export function renderMarkdown(source: string, baseDir: string): string {
  const fm = parseFrontmatter(source);
  if (!fm) return md.render(source, { baseDir });
  const working = blankFrontmatterLines(source, fm.endLine);
  return renderFrontmatterCard(fm.data) + md.render(working, { baseDir });
}

export interface OutlineEntry {
  level: number;
  text: string;
  slug: string;
}

export function extractOutline(source: string): OutlineEntry[] {
  const fm = parseFrontmatter(source);
  const working = fm ? blankFrontmatterLines(source, fm.endLine) : source;
  const tokens = md.parse(working, {});
  const counts = new Map<string, number>();
  const entries: OutlineEntry[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === "heading_open") {
      const inline = tokens[i + 1];
      entries.push({
        level: Number(token.tag.slice(1)),
        text: inline ? inline.content : "",
        slug: slugify(inline ? inline.content : "", counts),
      });
    }
  }
  return entries;
}
