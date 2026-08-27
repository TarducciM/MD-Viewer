import MarkdownIt from "markdown-it";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  ExternalHyperlink,
  WidthType,
} from "docx";

const md = new MarkdownIt({ html: false, linkify: true });

const HEADING_MAP: Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  h1: HeadingLevel.HEADING_1,
  h2: HeadingLevel.HEADING_2,
  h3: HeadingLevel.HEADING_3,
  h4: HeadingLevel.HEADING_4,
  h5: HeadingLevel.HEADING_5,
  h6: HeadingLevel.HEADING_6,
};

interface RunStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  code?: boolean;
}

function inlineTokensToRuns(children: any[] | null, baseStyle: RunStyle = {}): (TextRun | ExternalHyperlink)[] {
  const runs: (TextRun | ExternalHyperlink)[] = [];
  const styleStack: RunStyle[] = [baseStyle];
  let linkHref: string | null = null;
  let linkRuns: TextRun[] = [];

  const currentStyle = () => styleStack[styleStack.length - 1];
  const pushStyle = (patch: RunStyle) => styleStack.push({ ...currentStyle(), ...patch });
  const popStyle = () => styleStack.pop();

  function addText(text: string): void {
    if (!text) return;
    const style = currentStyle();
    const run = new TextRun({
      text,
      bold: style.bold,
      italics: style.italics,
      strike: style.strike,
      font: style.code ? "Consolas" : undefined,
      shading: style.code ? { fill: "F0F0F0" } : undefined,
    });
    if (linkHref !== null) linkRuns.push(run);
    else runs.push(run);
  }

  for (const token of children ?? []) {
    switch (token.type) {
      case "text":
        addText(token.content);
        break;
      case "softbreak":
      case "hardbreak":
        addText(" ");
        break;
      case "strong_open":
        pushStyle({ bold: true });
        break;
      case "strong_close":
        popStyle();
        break;
      case "em_open":
        pushStyle({ italics: true });
        break;
      case "em_close":
        popStyle();
        break;
      case "s_open":
        pushStyle({ strike: true });
        break;
      case "s_close":
        popStyle();
        break;
      case "code_inline":
        pushStyle({ code: true });
        addText(token.content);
        popStyle();
        break;
      case "link_open":
        linkHref = token.attrGet("href") ?? "";
        linkRuns = [];
        break;
      case "link_close":
        if (linkHref !== null) {
          runs.push(new ExternalHyperlink({ link: linkHref, children: linkRuns }));
          linkHref = null;
          linkRuns = [];
        }
        break;
      default:
        break;
    }
  }
  return runs;
}

// Strips a leading "[ ]"/"[x]" task-list marker from the item's first text token,
// returning a checkbox glyph to prefix the paragraph with (or null if not a task item).
function extractTaskMarker(children: any[] | null): string | null {
  const first = children?.[0];
  if (!first || first.type !== "text") return null;
  const match = /^\[([ xX])\]\s*/.exec(first.content);
  if (!match) return null;
  first.content = first.content.slice(match[0].length);
  return match[1].trim() ? "☑ " : "☐ ";
}

export async function markdownToDocxBlob(source: string): Promise<Blob> {
  const tokens = md.parse(source, {});
  const children: (Paragraph | Table)[] = [];
  const listStack: Array<{ ordered: boolean; counter: number }> = [];
  let quoteDepth = 0;
  let i = 0;

  function currentIndent(): { left: number } | undefined {
    const depth = listStack.length + quoteDepth;
    return depth > 0 ? { left: 360 * depth } : undefined;
  }

  while (i < tokens.length) {
    const token = tokens[i];
    switch (token.type) {
      case "heading_open": {
        children.push(
          new Paragraph({ heading: HEADING_MAP[token.tag], children: inlineTokensToRuns(tokens[i + 1].children) }),
        );
        i += 3;
        break;
      }
      case "paragraph_open": {
        const inline = tokens[i + 1];
        const checkbox = listStack.length ? extractTaskMarker(inline.children) : null;
        const prefixRuns: TextRun[] = [];
        if (checkbox) {
          prefixRuns.push(new TextRun(checkbox));
        } else if (listStack.length) {
          const top = listStack[listStack.length - 1];
          if (top.ordered) {
            top.counter += 1;
            prefixRuns.push(new TextRun(`${top.counter}. `));
          } else {
            prefixRuns.push(new TextRun("•  "));
          }
        }
        children.push(
          new Paragraph({
            indent: currentIndent(),
            children: [...prefixRuns, ...inlineTokensToRuns(inline.children, { italics: quoteDepth > 0 })],
          }),
        );
        i += 3;
        break;
      }
      case "bullet_list_open":
        listStack.push({ ordered: false, counter: 0 });
        i++;
        break;
      case "ordered_list_open":
        listStack.push({ ordered: true, counter: 0 });
        i++;
        break;
      case "bullet_list_close":
      case "ordered_list_close":
        listStack.pop();
        i++;
        break;
      case "blockquote_open":
        quoteDepth++;
        i++;
        break;
      case "blockquote_close":
        quoteDepth--;
        i++;
        break;
      case "fence":
      case "code_block": {
        const lines = token.content.replace(/\n$/, "").split("\n");
        for (const line of lines) {
          children.push(
            new Paragraph({
              indent: currentIndent(),
              children: [new TextRun({ text: line.length ? line : " ", font: "Consolas" })],
              shading: { fill: "F2F2F2" },
            }),
          );
        }
        i++;
        break;
      }
      case "hr":
        children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999" } } }));
        i++;
        break;
      case "table_open": {
        let j = i + 1;
        let header = false;
        const rows: { cells: (TextRun | ExternalHyperlink)[][]; header: boolean }[] = [];
        while (tokens[j] && tokens[j].type !== "table_close") {
          if (tokens[j].type === "thead_open") header = true;
          else if (tokens[j].type === "thead_close") header = false;
          else if (tokens[j].type === "tr_open") {
            const cells: (TextRun | ExternalHyperlink)[][] = [];
            j++;
            while (tokens[j].type !== "tr_close") {
              if (tokens[j].type === "th_open" || tokens[j].type === "td_open") {
                cells.push(inlineTokensToRuns(tokens[j + 1].children));
                j += 3;
              } else {
                j++;
              }
            }
            rows.push({ cells, header });
          }
          j++;
        }
        const tableRows = rows.map(
          (r) =>
            new TableRow({
              children: r.cells.map(
                (runs) =>
                  new TableCell({
                    children: [new Paragraph({ children: runs })],
                    shading: r.header ? { fill: "E8E8E8" } : undefined,
                  }),
              ),
            }),
        );
        children.push(new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
        i = j + 1;
        break;
      }
      default:
        i++;
        break;
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
}
