import { describe, it, expect } from "vitest";
import { parseFrontmatter } from "./frontmatter";

describe("parseFrontmatter", () => {
  it("returns null when the source has no frontmatter block", () => {
    expect(parseFrontmatter("# Title\n\nText")).toBeNull();
  });

  it("returns null when the opening delimiter is unclosed", () => {
    expect(parseFrontmatter("---\ntitle: x\n\n# Title")).toBeNull();
  });

  it("parses simple scalar key-value pairs", () => {
    const result = parseFrontmatter("---\ntitle: My Note\nauthor: Mek\n---\n\n# Body");
    expect(result?.data).toEqual({ title: "My Note", author: "Mek" });
  });

  it("strips matching quotes around a scalar value", () => {
    const result = parseFrontmatter('---\ntitle: "Quoted Title"\n---\n');
    expect(result?.data.title).toBe("Quoted Title");
  });

  it("coerces boolean and numeric scalars", () => {
    const result = parseFrontmatter("---\ndraft: true\npriority: 3\n---\n");
    expect(result?.data).toEqual({ draft: true, priority: 3 });
  });

  it("parses an inline list", () => {
    const result = parseFrontmatter("---\ntags: [foo, bar, baz]\n---\n");
    expect(result?.data.tags).toEqual(["foo", "bar", "baz"]);
  });

  it("parses a block list on indented dash lines", () => {
    const result = parseFrontmatter("---\ntags:\n  - foo\n  - bar\n---\n");
    expect(result?.data.tags).toEqual(["foo", "bar"]);
  });

  it("reports the line count consumed by the block, delimiters included", () => {
    const source = "---\ntitle: x\ntags: [a]\n---\n\n# Body";
    const result = parseFrontmatter(source);
    expect(result?.endLine).toBe(4);
    expect(source.split("\n").slice(result!.endLine).join("\n")).toBe("\n# Body");
  });

  it("ignores an empty key with no following list items", () => {
    const result = parseFrontmatter("---\nnote:\ntitle: x\n---\n");
    expect(result?.data.note).toEqual([]);
    expect(result?.data.title).toBe("x");
  });
});
