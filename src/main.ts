import { open, save } from "@tauri-apps/plugin-dialog";
import {
  readFile,
  writeFile,
  writeTextFile,
  exists,
  watchImmediate,
  type UnwatchFn,
} from "@tauri-apps/plugin-fs";
import { basename, dirname, sep } from "@tauri-apps/api/path";
import { renderMarkdown } from "./markdown";
import { buildTree, findFirstFile } from "./fileTree";
import { renderTree, setActiveFile } from "./treeView";
import { loadSettings, applySettings, type Settings } from "./settings";
import { setLanguage, applyTranslations, t } from "./i18n";
import { initSettingsPanel } from "./settingsPanel";
import { createMarkdownEditor, type MarkdownEditorHandle, type FormatAction } from "./editor";
import {
  detectEncoding,
  decodeBytes,
  encodeText,
  detectLineEnding,
  applyLineEnding,
  ENCODING_LABELS,
  type TextEncodingId,
  type LineEnding,
} from "./encoding";
import { markdownToPlainText, markdownToStandaloneHtml, EXPORT_HTML_CSS } from "./export";
import { markdownToDocxBlob } from "./docxExport";

const LAST_ROOT_KEY = "mdviewer.lastRoot";
const LAST_FILE_KEY = "mdviewer.lastFile";
const MD_FILTER = [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] }];
const RELOAD_DEBOUNCE_MS = 150;
const EDIT_PREVIEW_DEBOUNCE_MS = 120;

type ExportFormat = "pdf" | "docx" | "txt" | "html";

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
  exportBtn: document.querySelector<HTMLButtonElement>("#export-btn")!,
  exportMenu: document.querySelector<HTMLDivElement>("#export-menu")!,
  statusEncoding: document.querySelector<HTMLButtonElement>("#status-encoding")!,
  statusLineEnding: document.querySelector<HTMLButtonElement>("#status-line-ending")!,
  encodingMenu: document.querySelector<HTMLDivElement>("#encoding-menu")!,
  lineEndingMenu: document.querySelector<HTMLDivElement>("#line-ending-menu")!,
};

const settings: Settings = loadSettings();
setLanguage(settings.language);
applySettings(settings);

let currentRoot: string | null = null;
let currentFile: string | null = null;
let currentText = "";
let currentBaseDir = "";
let currentEncoding: TextEncodingId = "utf-8";
let currentLineEnding: LineEnding = "LF";
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

const dropdownMenus: HTMLElement[] = [];
function closeAllDropdowns(): void {
  dropdownMenus.forEach((m) => (m.hidden = true));
}
function setupDropdown(triggerEl: HTMLButtonElement, menuEl: HTMLElement): void {
  dropdownMenus.push(menuEl);
  triggerEl.addEventListener("click", (e) => {
    e.stopPropagation();
    if (triggerEl.disabled) return;
    const wasOpen = !menuEl.hidden;
    closeAllDropdowns();
    menuEl.hidden = wasOpen;
  });
}
document.addEventListener("click", closeAllDropdowns);

async function confirmDiscardIfDirty(): Promise<boolean> {
  if (!isDirty) return true;
  return window.confirm(t("edit.confirmDiscard"));
}

function updateEditUiState(): void {
  const hasFile = !!currentFile;
  els.editBtn.disabled = !hasFile;
  els.editBtn.classList.toggle("active", isEditing);
  els.editBtn.title = t(isEditing ? "toolbar.edit.exit.title" : "toolbar.edit.title");
  els.dirtyIndicator.hidden = !isDirty;
  els.exportBtn.disabled = !hasFile;
}

function updateStatusChips(): void {
  const hasFile = !!currentFile;
  els.statusEncoding.hidden = !hasFile;
  els.statusLineEnding.hidden = !hasFile;
  if (hasFile) {
    els.statusEncoding.textContent = ENCODING_LABELS[currentEncoding];
    els.statusLineEnding.textContent = currentLineEnding;
  }
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
  const text = applyLineEnding(editHandle.getValue(), currentLineEnding);
  const bytes = encodeText(text, currentEncoding);
  ignoreNextExternalChange = true;
  await writeFile(currentFile, bytes);
  currentText = text;
  els.preview.innerHTML = renderMarkdown(currentText, currentBaseDir);
  isDirty = false;
  updateEditUiState();
}

async function exportAs(format: ExportFormat): Promise<void> {
  if (!currentFile) return;
  if (format === "pdf") {
    window.print();
    return;
  }

  const sourceText = isEditing && editHandle ? editHandle.getValue() : currentText;
  const base = (await basename(currentFile)).replace(/\.[^.]+$/, "");

  try {
    if (format === "txt") {
      const path = await save({ defaultPath: `${base}.txt`, filters: [{ name: "Text", extensions: ["txt"] }] });
      if (!path) return;
      await writeTextFile(path, markdownToPlainText(sourceText));
    } else if (format === "html") {
      const path = await save({ defaultPath: `${base}.html`, filters: [{ name: "HTML", extensions: ["html"] }] });
      if (!path) return;
      const bodyHtml = renderMarkdown(sourceText, currentBaseDir);
      await writeTextFile(path, markdownToStandaloneHtml(bodyHtml, base, EXPORT_HTML_CSS));
    } else if (format === "docx") {
      const path = await save({ defaultPath: `${base}.docx`, filters: [{ name: "Word", extensions: ["docx"] }] });
      if (!path) return;
      const blob = await markdownToDocxBlob(sourceText);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await writeFile(path, bytes);
    }
  } catch (err) {
    els.statusLeft.textContent = t("status.openError", { error: String(err) });
  }
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
    const bytes = await readFile(filePath);
    const encoding = detectEncoding(bytes);
    const text = decodeBytes(bytes, encoding);
    const baseDir = await dirname(filePath);
    currentText = text;
    currentBaseDir = baseDir;
    currentEncoding = encoding;
    currentLineEnding = detectLineEnding(text);
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
    updateStatusChips();
    await watchCurrentFile();
  } catch (err) {
    els.statusLeft.textContent = t("status.openError", { error: String(err) });
  }
}

async function reloadCurrentFile(): Promise<void> {
  if (!currentFile || isEditing) return;
  try {
    const bytes = await readFile(currentFile);
    currentEncoding = detectEncoding(bytes);
    const text = decodeBytes(bytes, currentEncoding);
    currentLineEnding = detectLineEnding(text);
    const scrollTop = els.preview.scrollTop;
    currentText = text;
    els.preview.innerHTML = renderMarkdown(text, currentBaseDir);
    els.preview.scrollTop = scrollTop;
    updateStatusChips();
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
  updateStatusChips();
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

setupDropdown(els.exportBtn, els.exportMenu);
els.exportMenu.addEventListener("click", (e) => {
  const button = (e.target as HTMLElement).closest<HTMLElement>("[data-export]");
  if (!button) return;
  void exportAs(button.dataset.export as ExportFormat);
});

setupDropdown(els.statusEncoding, els.encodingMenu);
els.encodingMenu.addEventListener("click", (e) => {
  const button = (e.target as HTMLElement).closest<HTMLElement>("[data-encoding]");
  if (!button || !currentFile) return;
  currentEncoding = button.dataset.encoding as TextEncodingId;
  updateStatusChips();
  if (isEditing) markDirty();
});

setupDropdown(els.statusLineEnding, els.lineEndingMenu);
els.lineEndingMenu.addEventListener("click", (e) => {
  const button = (e.target as HTMLElement).closest<HTMLElement>("[data-line-ending]");
  if (!button || !currentFile) return;
  currentLineEnding = button.dataset.lineEnding as LineEnding;
  updateStatusChips();
  if (isEditing) markDirty();
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
