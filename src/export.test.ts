import { describe, it, expect } from "vitest";
import { markdownToPlainText, markdownToStandaloneHtml } from "./export";

describe("markdownToPlainText", () => {
  it("leaves non-table content untouched", () => {
    const source = "# Title\n\nSome **text**.\n";
    expect(markdownToPlainText(source)).toBe(source);
  });

  it("renders a table as an aligned ASCII grid", () => {
    const source = ["| Name | Age |", "| --- | --- |", "| Alice | 30 |", "| Bob | 5 |"].join("\n");
    const result = markdownToPlainText(source);
    expect(result).toBe(
      [
        "+-------+-----+",
        "| Name  | Age |",
        "+-------+-----+",
        "| Alice | 30  |",
        "| Bob   | 5   |",
        "+-------+-----+",
      ].join("\n"),
    );
  });

  it("keeps text before and after a table intact", () => {
    const source = ["Intro.", "", "| A | B |", "| --- | --- |", "| 1 | 2 |", "", "Outro."].join("\n");
    const result = markdownToPlainText(source);
    expect(result.startsWith("Intro.\n\n+")).toBe(true);
    expect(result.endsWith("\nOutro.")).toBe(true);
  });

  it("handles a table with no body rows", () => {
    const source = "| Col |\n| --- |";
    const result = markdownToPlainText(source);
    expect(result).toBe(["+-----+", "| Col |", "+-----+", "+-----+"].join("\n"));
  });

  it("does not treat a plain paragraph containing a pipe as a table", () => {
    const source = "This | is not a table, just | text.";
    expect(markdownToPlainText(source)).toBe(source);
  });
});

describe("markdownToStandaloneHtml", () => {
  it("embeds the body html and escapes the title", () => {
    const html = markdownToStandaloneHtml("<h1>Hi</h1>", "A <Title>", "body { color: red; }");
    expect(html).toContain("<h1>Hi</h1>");
    expect(html).toContain("<title>A &lt;Title&gt;</title>");
    expect(html).toContain("color: red;");
  });
});
