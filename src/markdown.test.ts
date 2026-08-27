import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
}));

const { renderMarkdown, resolveRelativePath, splitHighlightedLines, escapeHtml } = await import("./markdown");

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
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
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
