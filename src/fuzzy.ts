/**
 * Scores how well `query` matches `text` for a command-palette-style filter.
 * Lower is better; `null` means no match. An exact substring match ranks by
 * how early it starts; otherwise falls back to an in-order subsequence match
 * (e.g. "mdv" matches "Markdown View"), ranked by how spread out it is.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (q === "") return 0;

  const substringIndex = t.indexOf(q);
  if (substringIndex !== -1) return substringIndex;

  let qi = 0;
  let lastMatch = -1;
  let spread = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (lastMatch !== -1) spread += ti - lastMatch - 1;
      lastMatch = ti;
      qi++;
    }
  }
  if (qi < q.length) return null;
  return 1000 + spread;
}

export function fuzzyFilter<T>(query: string, items: T[], textOf: (item: T) => string): T[] {
  return items
    .map((item) => ({ item, score: fuzzyScore(query, textOf(item)) }))
    .filter((entry): entry is { item: T; score: number } => entry.score !== null)
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.item);
}
