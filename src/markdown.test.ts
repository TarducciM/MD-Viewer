import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
}));

const { renderMarkdown, resolveRelativePath, splitHighlightedLines, escapeHtml, extractOutline, mermaidSources } =
  await import("./markdown");

describe("resolveRelativePath", () => {
  it("joins a simple relative path onto a base directory", () => {
    expect(resolveRelativePath("C:\\docs\\guide", "img.png")).toBe("C:\\docs\\guide\\img.png");
  });

  it("resolves ../ segments", () => {
    expect(resolveRelativePath("C:\\docs\\guide", "../assets/img.png")).toBe("C:\\docs\\assets\\img.png");
  });

  it("ignores ./ segments", () => {
    expect(resolveRelativePath("C:\\docs\\guide", "./img.png")).toBe("C:\\docs\\guide\\img.png");
  });

  it("uses forward slashes when the base directory does", () => {
    expect(resolveRelativePath("/home/user/docs", "../img.png")).toBe("/home/user/img.png");
  });
});

describe("escapeHtml", () => {
  it("escapes the three HTML-significant characters", () => {
    expect(escapeHtml("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
  });
});

describe("splitHighlightedLines", () => {
  it("splits plain text on line breaks", () => {
    expect(splitHighlightedLines("a\nb\nc")).toEqual(["a", "b", "c"]);
  });

  it("keeps a span balanced when it does not cross a line", () => {
    expect(splitHighlightedLines('<span class="k">if</span>\nreturn')).toEqual([
      '<span class="k">if</span>',
      "return",
    ]);
  });

  it("closes and reopens a span that spans multiple lines", () => {
    const html = '<span class="c">/* line one\nline two */</span>\ncode';
    expect(splitHighlightedLines(html)).toEqual([
      '<span class="c">/* line one</span>',
      '<span class="c">line two */</span>',
      "code",
    ]);
  });

  it("handles nested spans crossing a line break, reopened in the same nesting order", () => {
    const html = '<span class="a">outer <span class="b">inner\nstill inner</span> back to outer</span>';
    expect(splitHighlightedLines(html)).toEqual([
      '<span class="a">outer <span class="b">inner</span></span>',
      '<span class="a"><span class="b">still inner</span> back to outer</span>',
    ]);
  });
});

describe("renderMarkdown", () => {
  it("renders headings and inline formatting", () => {
    const html = renderMarkdown("# Title\n\nSome **bold** and *italic* text.", "C:\\docs");
    expect(html).toContain('id="title"');
    expect(html).toContain(">Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("tags block-level elements with their source line", () => {
    const html = renderMarkdown("# Title\n\nA paragraph.", "C:\\docs");
    expect(html).toContain('data-line="0"');
    expect(html).toContain('data-line="2"');
  });

  it("dedups repeated heading slugs like GitHub", () => {
    const html = renderMarkdown("# Title\n\n# Title", "C:\\docs");
    expect(html).toContain('id="title"');
    expect(html).toContain('id="title-1"');
  });

  it("renders task list checkboxes", () => {
    const html = renderMarkdown("- [x] done\n- [ ] todo", "C:\\docs");
    expect(html).toContain('checked=""');
    expect(html).toContain("todo");
  });

  it("wraps fenced code blocks with numbered lines", () => {
    const html = renderMarkdown("```js\nconst a = 1;\nconst b = 2;\n```", "C:\\docs");
    expect(html).toContain('<pre class="hljs">');
    expect(html).toContain('<span class="line-no">1</span>');
    expect(html).toContain('<span class="line-no">2</span>');
    expect(html).not.toContain('<span class="line-no">3</span>');
  });

  it("does not execute raw HTML embedded in the source", () => {
    const html = renderMarkdown('<script>alert(1)</script>', "C:\\docs");
    expect(html).not.toContain("<script>");
  });

  it("rewrites a relative image path through convertFileSrc", () => {
    const html = renderMarkdown("![alt](./img/pic.png)", "C:\\docs\\notes");
    expect(html).toContain("asset://localhost/C:\\docs\\notes\\img\\pic.png");
  });

  it("leaves absolute (http) image URLs untouched", () => {
    const html = renderMarkdown("![alt](https://example.com/pic.png)", "C:\\docs");
    expect(html).toContain('src="https://example.com/pic.png"');
  });
});

describe("mermaid code blocks", () => {
  it("renders a placeholder instead of a highlighted code block", () => {
    const html = renderMarkdown("```mermaid\ngraph TD;\nA-->B;\n```", "C:\\docs");
    expect(html).toContain('class="mermaid-block"');
    expect(html).not.toContain('<pre class="hljs">');
    expect(html).toMatch(/data-mermaid-id="mermaid-[a-z0-9]+"/);
  });

  it("stores the raw diagram source in the side table, keyed by the placeholder id", () => {
    const source = "graph TD;\nX-->Y;";
    const html = renderMarkdown("```mermaid\n" + source + "\n```", "C:\\docs");
    const id = html.match(/data-mermaid-id="(mermaid-[a-z0-9]+)"/)?.[1];
    expect(id).toBeDefined();
    expect(mermaidSources.get(id!)).toBe(source + "\n");
  });

  it("maps identical diagram source to the same id across renders", () => {
    const source = "graph TD;\nSame-->Diagram;";
    const html1 = renderMarkdown("```mermaid\n" + source + "\n```", "C:\\docs");
    const html2 = renderMarkdown("```mermaid\n" + source + "\n```", "C:\\docs");
    const id1 = html1.match(/data-mermaid-id="([^"]+)"/)?.[1];
    const id2 = html2.match(/data-mermaid-id="([^"]+)"/)?.[1];
    expect(id1).toBe(id2);
  });

  it("still highlights normal code blocks", () => {
    const html = renderMarkdown("```js\nconst a = 1;\n```", "C:\\docs");
    expect(html).toContain('<pre class="hljs">');
  });
});

describe("wiki-links", () => {
  it("renders [[target]] as a wiki-link anchor", () => {
    const html = renderMarkdown("See [[My Note]] for details.", "C:\\docs");
    expect(html).toContain('class="wiki-link"');
    expect(html).toContain('data-wiki-target="My Note"');
    expect(html).toContain(">My Note</a>");
  });

  it("uses the part after | as the display label", () => {
    const html = renderMarkdown("See [[my-note|a note]] for details.", "C:\\docs");
    expect(html).toContain('data-wiki-target="my-note"');
    expect(html).toContain(">a note</a>");
  });

  it("leaves an unclosed [[ untouched", () => {
    const html = renderMarkdown("This is [[ not closed", "C:\\docs");
    expect(html).not.toContain("wiki-link");
  });

  it("does not treat an empty [[]] as a link", () => {
    const html = renderMarkdown("Empty [[]] brackets.", "C:\\docs");
    expect(html).not.toContain("wiki-link");
  });

  it("does not touch wiki-link-looking text inside inline code", () => {
    const html = renderMarkdown("Use `[[literal]]` in text.", "C:\\docs");
    expect(html).not.toContain("wiki-link");
    expect(html).toContain("[[literal]]");
  });
});

describe("frontmatter", () => {
  it("renders a card for the frontmatter block instead of raw text", () => {
    const html = renderMarkdown("---\ntitle: My Note\ntags: [a, b]\n---\n\n# Body", "C:\\docs");
    expect(html).toContain('class="frontmatter-card"');
    expect(html).toContain(">title<");
    expect(html).toContain(">My Note<");
    expect(html).toContain('class="frontmatter-tag">a<');
    expect(html).toContain('class="frontmatter-tag">b<');
    expect(html).not.toContain("title: My Note");
  });

  it("keeps data-line numbers aligned to the original source after the frontmatter block", () => {
    const html = renderMarkdown("---\ntitle: x\n---\n\n# Body", "C:\\docs");
    expect(html).toContain('data-line="4"');
  });

  it("renders normally when there is no frontmatter block", () => {
    const html = renderMarkdown("# Body", "C:\\docs");
    expect(html).not.toContain("frontmatter-card");
    expect(html).toContain('data-line="0"');
  });
});

describe("extractOutline", () => {
  it("extracts headings in order with their level and slug", () => {
    const outline = extractOutline("# Title\n\n## Sub one\n\nText\n\n## Sub two");
    expect(outline).toEqual([
      { level: 1, text: "Title", slug: "title" },
      { level: 2, text: "Sub one", slug: "sub-one" },
      { level: 2, text: "Sub two", slug: "sub-two" },
    ]);
  });

  it("returns an empty list when there are no headings", () => {
    expect(extractOutline("Just a paragraph.")).toEqual([]);
  });

  it("dedups slugs the same way renderMarkdown does", () => {
    const outline = extractOutline("# Title\n\n# Title");
    expect(outline.map((entry) => entry.slug)).toEqual(["title", "title-1"]);
  });

  it("ignores a leading frontmatter block and does not mistake it for a heading", () => {
    const outline = extractOutline("---\ntitle: Not A Heading\n---\n\n# Real Heading");
    expect(outline).toEqual([{ level: 1, text: "Real Heading", slug: "real-heading" }]);
  });
});
