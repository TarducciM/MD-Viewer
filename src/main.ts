import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile, exists, watchImmediate, type UnwatchFn } from "@tauri-apps/plugin-fs";
import { basename, dirname, sep } from "@tauri-apps/api/path";
import { renderMarkdown } from "./markdown";
import { buildTree, findFirstFile } from "./fileTree";
import { renderTree, setActiveFile } from "./treeView";
import { loadSettings, applySettings, type Settings } from "./settings";
import { setLanguage, applyTranslations, t } from "./i18n";
import { initSettingsPanel } from "./settingsPanel";

const LAST_ROOT_KEY = "mdviewer.lastRoot";
const LAST_FILE_KEY = "mdviewer.lastFile";
const MD_FILTER = [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] }];
const RELOAD_DEBOUNCE_MS = 150;

const els = {
  openFolderBtn: document.querySelector<HTMLButtonElement>("#open-folder-btn")!,
  openFileBtn: document.querySelector<HTMLButtonElement>("#open-file-btn")!,
  emptyOpenFolderBtn: document.querySelector<HTMLButtonElement>("#empty-open-folder-btn")!,
  emptyOpenFileBtn: document.querySelector<HTMLButtonElement>("#empty-open-file-btn")!,
  fileTree: document.querySelector<HTMLDivElement>("#file-tree")!,
  sidebarTitle: document.querySelector<HTMLSpanElement>("#sidebar-title")!,
  emptyState: document.querySelector<HTMLDivElement>("#empty-state")!,
  preview: document.querySelector<HTMLElement>("#markdown-preview")!,
  breadcrumb: document.querySelector<HTMLDivElement>("#breadcrumb")!,
  statusLeft: document.querySelector<HTMLSpanElement>("#status-left")!,
};

const settings: Settings = loadSettings();
setLanguage(settings.language);
applySettings(settings);

let currentRoot: string | null = null;
let currentFile: string | null = null;
let unwatchFile: UnwatchFn | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;

function setupSidebarResizer(): void {
  const resizer = document.querySelector<HTMLDivElement>("#resizer")!;
  const sidebar = document.querySelector<HTMLDivElement>("#sidebar")!;
  resizer.addEventListener("mousedown", () => {
    const onMove = (e: MouseEvent) => {
      const width = Math.min(480, Math.max(160, e.clientX));
      sidebar.style.width = `${width}px`;
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

async function openFolder(): Promise<void> {
  const selected = await open({ directory: true, multiple: false });
  if (!selected || Array.isArray(selected)) return;
  await loadFolder(selected);
}

async function openFile(): Promise<void> {
  const selected = await open({ multiple: false, filters: MD_FILTER });
  if (!selected || Array.isArray(selected)) return;
  const dir = await dirname(selected);
  await loadFolder(dir, selected);
}

async function loadFolder(rootPath: string, initialFile?: string): Promise<void> {
  currentRoot = rootPath;
  localStorage.setItem(LAST_ROOT_KEY, rootPath);
  const rootName = await basename(rootPath);
  els.sidebarTitle.textContent = rootName.toUpperCase();
  els.statusLeft.textContent = t("status.scanning");

  const tree = await buildTree(rootPath, rootName, settings.showHidden);
  renderTree(tree, els.fileTree, { onSelectFile: selectFile });

  const target = initialFile ?? findFirstFile(tree)?.path ?? null;
  if (target) {
    await selectFile(target);
  } else {
    els.statusLeft.textContent = t("status.noMarkdown");
  }
}

async function selectFile(filePath: string): Promise<void> {
  try {
    const text = await readTextFile(filePath);
    const baseDir = await dirname(filePath);
    els.preview.innerHTML = renderMarkdown(text, baseDir);
    els.preview.hidden = false;
    els.emptyState.hidden = true;
    els.breadcrumb.textContent = await buildBreadcrumb(filePath);
    els.statusLeft.textContent = filePath;
    localStorage.setItem(LAST_FILE_KEY, filePath);
    currentFile = filePath;
    setActiveFile(filePath);
    els.preview.scrollTop = 0;
    await watchCurrentFile();
  } catch (err) {
    els.statusLeft.textContent = t("status.openError", { error: String(err) });
  }
}

async function reloadCurrentFile(): Promise<void> {
  if (!currentFile) return;
  try {
    const text = await readTextFile(currentFile);
    const baseDir = await dirname(currentFile);
    const scrollTop = els.preview.scrollTop;
    els.preview.innerHTML = renderMarkdown(text, baseDir);
    els.preview.scrollTop = scrollTop;
  } catch {
    // The file may have been removed or is mid-write; keep showing the last good render.
  }
}

async function watchCurrentFile(): Promise<void> {
  unwatchFile?.();
  unwatchFile = null;
  if (!settings.autoReload || !currentFile) return;
  unwatchFile = await watchImmediate(currentFile, () => {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => void reloadCurrentFile(), RELOAD_DEBOUNCE_MS);
  });
}

async function buildBreadcrumb(filePath: string): Promise<string> {
  if (!currentRoot) return filePath;
  const rootName = await basename(currentRoot);
  const relative = filePath.startsWith(currentRoot)
    ? filePath.slice(currentRoot.length).replace(/^[\\/]/, "")
    : filePath;
  return relative ? `${rootName} ${sep()} ${relative.split(/[\\/]/).join(` ${sep()} `)}` : rootName;
}

function showEmptyState(): void {
  els.emptyState.hidden = false;
  els.preview.hidden = true;
  els.breadcrumb.textContent = "";
}

async function restoreLastSession(): Promise<void> {
  const lastRoot = localStorage.getItem(LAST_ROOT_KEY);
  if (!lastRoot || !(await exists(lastRoot))) {
    showEmptyState();
    return;
  }
  const lastFile = localStorage.getItem(LAST_FILE_KEY);
  const fileStillValid = lastFile && (await exists(lastFile));
  await loadFolder(lastRoot, fileStillValid ? lastFile! : undefined);
}

els.openFolderBtn.addEventListener("click", openFolder);
els.openFileBtn.addEventListener("click", openFile);
els.emptyOpenFolderBtn.addEventListener("click", openFolder);
els.emptyOpenFileBtn.addEventListener("click", openFile);

window.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod || e.key.toLowerCase() !== "o") return;
  e.preventDefault();
  if (e.shiftKey) void openFolder();
  else void openFile();
});

initSettingsPanel(settings, {
  onLanguageChange: () => {},
  onShowHiddenChange: () => {
    if (currentRoot) void loadFolder(currentRoot, currentFile ?? undefined);
  },
  onAutoReloadChange: () => {
    void watchCurrentFile();
  },
});

applyTranslations();
setupSidebarResizer();
void restoreLastSession();
