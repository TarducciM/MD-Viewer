import { describe, it, expect } from "vitest";
import { markdownToDocxBlob } from "./docxExport";

describe("markdownToDocxBlob", () => {
  it("produces a non-empty zip-based (docx) blob for a rich document", async () => {
    const source = [
      "# Title",
      "",
      "A paragraph with **bold**, *italic*, ~~strike~~ and `code`, plus a [link](https://example.com).",
      "",
      "- one",
      "- two",
      "",
      "1. first",
      "2. second",
      "",
      "- [x] done",
      "- [ ] todo",
      "",
      "> a quote",
      "",
      "```js",
      "const a = 1;",
      "```",
      "",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "---",
      "",
      "final paragraph",
    ].join("\n");

    const blob = await markdownToDocxBlob(source);
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toContain("wordprocessingml");

    const bytes = new Uint8Array(await blob.arrayBuffer());
    // docx files are zip archives, which start with the "PK\x03\x04" local file header signature.
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });

  it("handles an empty document without throwing", async () => {
    const blob = await markdownToDocxBlob("");
    expect(blob.size).toBeGreaterThan(0);
  });
});
