import type { TreeNode } from "./fileTree";

const FOLDER_ICON = `<svg viewBox="0 0 16 16" class="node-icon"><path d="M1.5 3a.5.5 0 0 1 .5-.5h3.6l1.2 1.4H14a.5.5 0 0 1 .5.5v8.1a.5.5 0 0 1-.5.5H2a.5.5 0 0 1-.5-.5V3z" fill="#5A9BD5"/></svg>`;
const FILE_ICON = `<svg viewBox="0 0 16 16" class="node-icon"><path d="M4 1.5h5.5L12.5 4.5V14a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5v-12A.5.5 0 0 1 4 1.5z" fill="#A9B7C6" fill-opacity=".15" stroke="#8A9199"/><path d="M9.3 1.6V4.5h2.9" fill="none" stroke="#8A9199"/></svg>`;
const CHEVRON = `<svg viewBox="0 0 16 16" class="chevron"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export interface TreeViewCallbacks {
  onSelectFile: (path: string) => void;
}

let activePath: string | null = null;
let activeRowEl: HTMLElement | null = null;
const rowsByPath = new Map<string, HTMLElement>();

export function renderTree(root: TreeNode, container: HTMLElement, callbacks: TreeViewCallbacks): void {
  container.innerHTML = "";
  rowsByPath.clear();
  activeRowEl = null;
  const list = document.createElement("div");
  list.className = "tree-list";
  for (const child of root.children ?? []) {
    list.appendChild(renderNode(child, 0, callbacks));
  }
  container.appendChild(list);
}

function renderNode(node: TreeNode, depth: number, callbacks: TreeViewCallbacks): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "tree-node";

  const row = document.createElement("div");
  row.className = "tree-row";
  row.style.paddingLeft = `${8 + depth * 16}px`;
  row.tabIndex = 0;
  row.dataset.path = node.path;
  row.dataset.isDir = String(node.isDir);

  if (node.isDir) {
    row.classList.add("tree-row-dir");
    row.innerHTML = `${CHEVRON}${FOLDER_ICON}<span class="node-label">${escapeHtml(node.name)}</span>`;
    const childList = document.createElement("div");
    childList.className = "tree-children";
    for (const child of node.children ?? []) {
      childList.appendChild(renderNode(child, depth + 1, callbacks));
    }
    row.addEventListener("click", () => {
      const collapsed = wrapper.classList.toggle("collapsed");
      row.classList.toggle("expanded", !collapsed);
    });
    wrapper.appendChild(row);
    wrapper.appendChild(childList);
  } else {
    row.classList.add("tree-row-file");
    row.innerHTML = `<span class="chevron-spacer"></span>${FILE_ICON}<span class="node-label">${escapeHtml(node.name)}</span>`;
    row.addEventListener("click", () => callbacks.onSelectFile(node.path));
    rowsByPath.set(node.path, row);
    wrapper.appendChild(row);
  }

  return wrapper;
}

export function setActiveFile(path: string): void {
  if (activeRowEl) activeRowEl.classList.remove("active");
  const row = rowsByPath.get(path);
  activePath = path;
  activeRowEl = row ?? null;
  if (row) {
    row.classList.add("active");
    row.scrollIntoView({ block: "nearest" });
    let el: HTMLElement | null = row.closest(".tree-children");
    while (el) {
      el.parentElement?.classList.remove("collapsed");
      el = el.parentElement?.closest(".tree-children") ?? null;
    }
  }
}

export function getActiveFile(): string | null {
  return activePath;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
