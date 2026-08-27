import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, exists, watchImmediate, type UnwatchFn } from "@tauri-apps/plugin-fs";
import { basename, dirname, sep } from "@tauri-apps/api/path";
import { renderMarkdown } from "./markdown";
import { buildTree, findFirstFile } from "./fileTree";
import { renderTree, setActiveFile } from "./treeView";
import { loadSettings, applySettings, type Settings } from "./settings";
import { setLanguage, applyTranslations, t } from "./i18n";
import { initSettingsPanel } from "./settingsPanel";
import { createMarkdownEditor, type MarkdownEditorHandle, type FormatAction } from "./editor";

const LAST_ROOT_KEY = "mdviewer.lastRoot";
const LAST_FILE_KEY = "mdviewer.lastFile";
const MD_FILTER = [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] }];
const RELOAD_DEBOUNCE_MS = 150;
const EDIT_PREVIEW_DEBOUNCE_MS = 120;

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
  editBtn: document.querySelector<HTMLButtonElement>("#edit-btn")!,
  dirtyIndicator: document.querySelector<HTMLSpanElement>("#dirty-indicator")!,
  editLayout: document.querySelector<HTMLDivElement>("#edit-layout")!,
  editorPane: document.querySelector<HTMLDivElement>("#editor-pane")!,
  editPreview: document.querySelector<HTMLElement>("#edit-preview")!,
  editCloseBtn: document.querySelector<HTMLButtonElement>("#edit-close-btn")!,
  editorColumn: document.querySelector<HTMLDivElement>("#editor-column")!,
  editToolbar: document.querySelector<HTMLDivElement>("#edit-toolbar")!,
};

const settings: Settings = loadSettings();
setLanguage(settings.language);
applySettings(settings);

let currentRoot: string | null = null;
let currentFile: string | null = null;
let currentText = "";
let currentBaseDir = "";
let unwatchFile: UnwatchFn | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;
let ignoreNextExternalChange = false;

let editHandle: MarkdownEditorHandle | null = null;
let isEditing = false;
let isDirty = false;
let editPreviewTimer: ReturnType<typeof setTimeout> | null = null;

function setupResizer(handleEl: HTMLElement, targetEl: HTMLElement): void {
  handleEl.addEventListener("mousedown", (downEvent) => {
    const startX = downEvent.clientX;
    const startWidth = targetEl.getBoundingClientRect().width;
    const parentWidth = targetEl.parentElement!.getBoundingClientRect().width;
    const onMove = (e: MouseEvent) => {
      const width = Math.min(parentWidth * 0.8, Math.max(160, startWidth + (e.clientX - startX)));
      targetEl.style.width = `${width}px`;
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

async function confirmDiscardIfDirty(): Promise<boolean> {
  if (!isDirty) return true;
  return window.confirm(t("edit.confirmDiscard"));
}

function updateEditUiState(): void {
  els.editBtn.disabled = !currentFile;
  els.editBtn.classList.toggle("active", isEditing);
  els.editBtn.title = t(isEditing ? "toolbar.edit.exit.title" : "toolbar.edit.title");
  els.dirtyIndicator.hidden = !isDirty;
}

function markDirty(): void {
  if (isDirty) return;
  isDirty = true;
  updateEditUiState();
}

async function enterEditMode(): Promise<void> {
  if (!currentFile || isEditing) return;
  unwatchFile?.();
  unwatchFile = null;

  isEditing = true;
  els.preview.hidden = true;
  els.editLayout.hidden = false;
  els.editPreview.innerHTML = renderMarkdown(currentText, currentBaseDir);

  editHandle = createMarkdownEditor(els.editorPane, currentText, (text) => {
    markDirty();
    if (editPreviewTimer) clearTimeout(editPreviewTimer);
    editPreviewTimer = setTimeout(() => {
      els.editPreview.innerHTML = renderMarkdown(text, currentBaseDir);
    }, EDIT_PREVIEW_DEBOUNCE_MS);
  });
  editHandle.focus();
  updateEditUiState();
}

function exitEditMode(): void {
  editHandle?.destroy();
  editHandle = null;
  isEditing = false;
  isDirty = false;
  els.editLayout.hidden = true;
  els.preview.hidden = false;
  updateEditUiState();
  void watchCurrentFile();
}

async function toggleEditMode(): Promise<void> {
  if (!currentFile) return;
  if (isEditing) {
    if (!(await confirmDiscardIfDirty())) return;
    exitEditMode();
  } else {
    await enterEditMode();
  }
}

async function saveCurrentFile(): Promise<void> {
  if (!isEditing || !currentFile || !editHandle) return;
  const text = editHandle.getValue();
  ignoreNextExternalChange = true;
  await writeTextFile(currentFile, text);
  currentText = text;
  els.preview.innerHTML = renderMarkdown(currentText, currentBaseDir);
  isDirty = false;
  updateEditUiState();
}

async function openFolder(): Promise<void> {
  if (!(await confirmDiscardIfDirty())) return;
  const selected = await open({ directory: true, multiple: false });
  if (!selected || Array.isArray(selected)) return;
  if (isEditing) exitEditMode();
  await loadFolder(selected);
}

async function openFile(): Promise<void> {
  if (!(await confirmDiscardIfDirty())) return;
  const selected = await open({ multiple: false, filters: MD_FILTER });
  if (!selected || Array.isArray(selected)) return;
  if (isEditing) exitEditMode();
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
  renderTree(tree, els.fileTree, { onSelectFile: handleTreeSelect });

  const target = initialFile ?? findFirstFile(tree)?.path ?? null;
  if (target) {
    await selectFile(target);
  } else {
    els.statusLeft.textContent = t("status.noMarkdown");
  }
}

async function handleTreeSelect(filePath: string): Promise<void> {
  if (filePath === currentFile) return;
  if (!(await confirmDiscardIfDirty())) return;
  if (isEditing) exitEditMode();
  await selectFile(filePath);
}

async function selectFile(filePath: string): Promise<void> {
  try {
    const text = await readTextFile(filePath);
    const baseDir = await dirname(filePath);
    currentText = text;
    currentBaseDir = baseDir;
    els.preview.innerHTML = renderMarkdown(text, baseDir);
    els.preview.hidden = false;
    els.emptyState.hidden = true;
    els.breadcrumb.textContent = await buildBreadcrumb(filePath);
    els.statusLeft.textContent = filePath;
    localStorage.setItem(LAST_FILE_KEY, filePath);
    currentFile = filePath;
    setActiveFile(filePath);
    els.preview.scrollTop = 0;
    updateEditUiState();
    await watchCurrentFile();
  } catch (err) {
    els.statusLeft.textContent = t("status.openError", { error: String(err) });
  }
}

async function reloadCurrentFile(): Promise<void> {
  if (!currentFile || isEditing) return;
  try {
    const text = await readTextFile(currentFile);
    const scrollTop = els.preview.scrollTop;
    currentText = text;
    els.preview.innerHTML = renderMarkdown(text, currentBaseDir);
    els.preview.scrollTop = scrollTop;
  } catch {
    // The file may have been removed or is mid-write; keep showing the last good render.
  }
}

async function watchCurrentFile(): Promise<void> {
  unwatchFile?.();
  unwatchFile = null;
  if (!settings.autoReload || !currentFile || isEditing) return;
  unwatchFile = await watchImmediate(currentFile, () => {
    if (ignoreNextExternalChange) {
      ignoreNextExternalChange = false;
      return;
    }
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
  updateEditUiState();
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
els.editBtn.addEventListener("click", () => void toggleEditMode());
els.editCloseBtn.addEventListener("click", () => void toggleEditMode());
els.editToolbar.addEventListener("click", (e) => {
  const button = (e.target as HTMLElement).closest<HTMLElement>("[data-format]");
  if (!button || !editHandle) return;
  editHandle.format(button.dataset.format as FormatAction);
});

window.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const key = e.key.toLowerCase();
  if (key === "o") {
    e.preventDefault();
    if (e.shiftKey) void openFolder();
    else void openFile();
  } else if (key === "e") {
    e.preventDefault();
    void toggleEditMode();
  } else if (key === "s") {
    e.preventDefault();
    void saveCurrentFile();
  }
});

initSettingsPanel(settings, {
  onLanguageChange: () => updateEditUiState(),
  onShowHiddenChange: () => {
    if (currentRoot) void loadFolder(currentRoot, currentFile ?? undefined);
  },
  onAutoReloadChange: () => {
    void watchCurrentFile();
  },
});

applyTranslations();
setupResizer(document.querySelector<HTMLDivElement>("#resizer")!, document.querySelector<HTMLDivElement>("#sidebar")!);
setupResizer(document.querySelector<HTMLDivElement>("#edit-resizer")!, els.editorColumn);
void restoreLastSession();
