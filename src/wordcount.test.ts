import { describe, it, expect } from "vitest";
import { countWords } from "./wordcount";

describe("countWords", () => {
  it("counts plain words", () => {
    expect(countWords("one two three four five").words).toBe(5);
  });

  it("returns zero for empty text", () => {
    expect(countWords("").words).toBe(0);
    expect(countWords("   \n\n  ").words).toBe(0);
    expect(countWords("").minutes).toBe(0);
  });

  it("excludes fenced code blocks from the count", () => {
    const text = "one two\n\n```js\nconst a = 1;\nconst b = 2;\n```\n\nthree";
    expect(countWords(text).words).toBe(3);
  });

  it("excludes inline code and image syntax", () => {
    const text = "look at `this code` and ![an image](pic.png) here";
    const result = countWords(text);
    expect(result.words).toBeLessThan(text.split(/\s+/).length);
  });

  it("estimates at least 1 minute for any non-empty text", () => {
    expect(countWords("just a few words").minutes).toBe(1);
  });

  it("estimates roughly words/200 minutes for long text", () => {
    const text = Array.from({ length: 1000 }, () => "word").join(" ");
    expect(countWords(text).minutes).toBe(5);
  });
});
