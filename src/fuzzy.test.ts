import { describe, it, expect } from "vitest";
import { fuzzyScore, fuzzyFilter } from "./fuzzy";

describe("fuzzyScore", () => {
  it("matches an empty query against anything with the best score", () => {
    expect(fuzzyScore("", "Anything")).toBe(0);
  });

  it("scores an earlier substring match better than a later one", () => {
    const early = fuzzyScore("open", "Open file");
    const late = fuzzyScore("open", "Re-open file");
    expect(early).not.toBeNull();
    expect(late).not.toBeNull();
    expect(early!).toBeLessThan(late!);
  });

  it("is case-insensitive", () => {
    expect(fuzzyScore("OPEN", "open file")).toBe(0);
  });

  it("falls back to an in-order subsequence match", () => {
    expect(fuzzyScore("mdv", "Markdown View")).not.toBeNull();
  });

  it("ranks a substring match better than a subsequence-only match", () => {
    const substring = fuzzyScore("open", "Open file");
    const subsequence = fuzzyScore("opfl", "Open file");
    expect(substring).not.toBeNull();
    expect(subsequence).not.toBeNull();
    expect(substring!).toBeLessThan(subsequence!);
  });

  it("returns null when the characters don't appear in order", () => {
    expect(fuzzyScore("zzz", "Open file")).toBeNull();
  });

  it("returns null when query is longer than any possible match", () => {
    expect(fuzzyScore("openfilelong", "Open file")).toBeNull();
  });
});

describe("fuzzyFilter", () => {
  it("keeps only matching items, sorted by score", () => {
    const items = ["Close tab", "Open file", "Open folder", "Settings"];
    expect(fuzzyFilter("open", items, (s) => s)).toEqual(["Open file", "Open folder"]);
  });

  it("returns everything unfiltered for an empty query", () => {
    const items = ["a", "b", "c"];
    expect(fuzzyFilter("", items, (s) => s)).toEqual(items);
  });
});
