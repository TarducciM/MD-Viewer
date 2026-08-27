export type FrontmatterValue = string | number | boolean | string[];

export interface FrontmatterResult {
  data: Record<string, FrontmatterValue>;
  /** Number of source lines the frontmatter block occupies, delimiters included. */
  endLine: number;
}

const DELIMITER = /^---\s*$/;
const KEY_LINE = /^([A-Za-z0-9_-]+):\s*(.*)$/;
const LIST_ITEM = /^\s*-\s+(.*)$/;

function coerceScalar(raw: string): FrontmatterValue {
  let value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (value !== "" && !Number.isNaN(Number(value))) return Number(value);
  return value;
}

function parseInlineList(raw: string): string[] {
  const inner = raw.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (!inner.trim()) return [];
  return inner.split(",").map((item) => String(coerceScalar(item)));
}

/**
 * Parses only the common flat subset of YAML frontmatter (scalars, inline
 * `[a, b]` lists, and `- item` block lists) — enough for typical note
 * metadata (title, tags, date) without pulling in a full YAML parser.
 */
export function parseFrontmatter(source: string): FrontmatterResult | null {
  const lines = source.split("\n");
  if (lines.length === 0 || !DELIMITER.test(lines[0])) return null;

  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (DELIMITER.test(lines[i])) {
      closingIndex = i;
      break;
    }
  }
  if (closingIndex === -1) return null;

  const data: Record<string, FrontmatterValue> = {};
  let i = 1;
  while (i < closingIndex) {
    const match = KEY_LINE.exec(lines[i]);
    if (!match) {
      i++;
      continue;
    }
    const [, key, rest] = match;
    if (rest.trim().startsWith("[")) {
      data[key] = parseInlineList(rest);
      i++;
      continue;
    }
    if (rest.trim() !== "") {
      data[key] = coerceScalar(rest);
      i++;
      continue;
    }
    const items: string[] = [];
    let j = i + 1;
    while (j < closingIndex) {
      const itemMatch = LIST_ITEM.exec(lines[j]);
      if (!itemMatch) break;
      items.push(itemMatch[1].trim());
      j++;
    }
    data[key] = items;
    i = items.length > 0 ? j : i + 1;
  }

  return { data, endLine: closingIndex + 1 };
}
