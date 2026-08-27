import mermaid from "mermaid";
import { t } from "./i18n";

function currentThemeVariables(): Record<string, string> {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => style.getPropertyValue(name).trim();
  return {
    background: read("--bg-editor"),
    primaryColor: read("--bg-panel-alt"),
    primaryTextColor: read("--text"),
    primaryBorderColor: read("--border-soft"),
    lineColor: read("--text-muted"),
    secondaryColor: read("--bg-hover"),
    tertiaryColor: read("--bg-panel"),
    textColor: read("--text"),
    fontFamily: "inherit",
  };
}

let renderSeq = 0;

export async function renderMermaidBlocks(container: HTMLElement, sources: Map<string, string>): Promise<void> {
  const placeholders = Array.from(container.querySelectorAll<HTMLElement>("[data-mermaid-id]"));
  if (placeholders.length === 0) return;

  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", themeVariables: currentThemeVariables() });

  for (const el of placeholders) {
    const id = el.dataset.mermaidId;
    const source = id ? sources.get(id) : undefined;
    if (!source) continue;
    try {
      const { svg } = await mermaid.render(`mermaid-svg-${renderSeq++}`, source);
      el.innerHTML = svg;
      el.classList.add("mermaid-rendered");
    } catch (err) {
      el.textContent = t("mermaid.error", { error: err instanceof Error ? err.message : String(err) });
      el.classList.add("mermaid-error");
    }
  }
}
