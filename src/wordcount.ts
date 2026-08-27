const WORDS_PER_MINUTE = 200;

export interface WordCount {
  words: number;
  minutes: number;
}

export function countWords(text: string): WordCount {
  const stripped = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[#>*_~\-|]/g, " ");

  const words = stripped.split(/\s+/).filter(Boolean).length;
  const minutes = words === 0 ? 0 : Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  return { words, minutes };
}
