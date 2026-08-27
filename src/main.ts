import { open, save } from "@tauri-apps/plugin-dialog";
import {
  readFile,
  readDir,
  writeFile,
  writeTextFile,
  exists,
  watchImmediate,
  type UnwatchFn,
} from "@tauri-apps/plugin-fs";
import { basename, dirname, sep } from "@tauri-apps/api/path";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { renderMarkdown, extractOutline } from "./markdown";
import { buildTree, findFirstFile } from "./fileTree";
import { renderTree, setActiveFile } from "./treeView";
import { loadSettings, saveSettings, applySettings, type Settings, type ThemeMode } from "./settings";
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
import { countWords } from "./wordcount";
import { getRecents, addRecent } from "./recents";
import { searchInFiles, type SearchResult } from "./search";

const LAST_ROOT_KEY = "mdviewer.lastRoot";
const LAST_FILE_KEY = "mdviewer.lastFile";
const MD_FILTER = [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] }];
const RELOAD_DEBOUNCE_MS = 150;
const EDIT_PREVIEW_DEBOUNCE_MS = 120;
const REPO_URL = "https://github.com/TarducciM/MD-Viewer";

type ExportFormat = "pdf" | "docx" | "txt" | "html";

interface Tab {
  filePath: string;
  text: string;
  baseDir: string;
  encoding: TextEncodingId;
  lineEnding: LineEnding;
  isEditing: boolean;
  isDirty: boolean;
  editBuffer: string | null;
  scrollTop: number;
  unwatch: UnwatchFn | null;
  reloadTimer: ReturnType<typeof setTimeout> | null;
  ignoreNextExternalChange: boolean;
}

const els = {
  menuFileBtn: document.querySelector<HTMLButtonElement>("#menu-file-btn")!,
  menuFile: document.querySelector<HTMLDivElement>("#menu-file")!,
  menuRecentSection: document.querySelector<HTMLDivElement>("#menu-recent-section")!,
  menuRecent: document.querySelector<HTMLDivElement>("#menu-recent")!,
  menuViewBtn: document.querySelector<HTMLButtonElement>("#menu-view-btn")!,
  menuView: document.querySelector<HTMLDivElement>("#menu-view")!,
  menuHelpBtn: document.querySelector<HTMLButtonElement>("#menu-help-btn")!,
  menuHelp: document.querySelector<HTMLDivElement>("#menu-help")!,
  openFolderBtn: document.querySelector<HTMLButtonElement>("#open-folder-btn")!,
  openFileBtn: document.querySelector<HTMLButtonElement>("#open-file-btn")!,
  emptyOpenFolderBtn: document.querySelector<HTMLButtonElement>("#empty-open-folder-btn")!,
  emptyOpenFileBtn: document.querySelector<HTMLButtonElement>("#empty-open-file-btn")!,
  body: document.querySelector<HTMLDivElement>("#body")!,
  fileTree: document.querySelector<HTMLDivElement>("#file-tree")!,
  sidebarTitle: document.querySelector<HTMLSpanElement>("#sidebar-title")!,
  tabBar: document.querySelector<HTMLDivElement>("#tab-bar")!,
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
  settingsBtn: document.querySelector<HTMLButtonElement>("#settings-btn")!,
  exportBtn: document.querySelector<HTMLButtonElement>("#export-btn")!,
  exportMenu: document.querySelector<HTMLDivElement>("#export-menu")!,
  statusWordcount: document.querySelector<HTMLSpanElement>("#status-wordcount")!,
  statusEncoding: document.querySelector<HTMLButtonElement>("#status-encoding")!,
  statusLineEnding: document.querySelector<HTMLButtonElement>("#status-line-ending")!,
  encodingMenu: document.querySelector<HTMLDivElement>("#encoding-menu")!,
  lineEndingMenu: document.querySelector<HTMLDivElement>("#line-ending-menu")!,
  outlinePanel: document.querySelector<HTMLDivElement>("#outline-panel")!,
  outlineList: document.querySelector<HTMLDivElement>("#outline-list")!,
  sidebarSearchToggle: document.querySelector<HTMLButtonElement>("#sidebar-search-toggle")!,
  sidebarSearch: document.querySelector<HTMLDivElement>("#sidebar-search")!,
  sidebarSearchInput: document.querySelector<HTMLInputElement>("#sidebar-search-input")!,
  sidebarSearchResults: document.querySelector<HTMLDivElement>("#sidebar-search-results")!,
};

const settings: Settings = loadSettings();
setLanguage(settings.language);
applySettings(settings);

const tabs: Tab[] = [];
let activeTabPath: string | null = null;
let editHandle: MarkdownEditorHandle | null = null;
let editPreviewTimer: ReturnType<typeof setTimeout> | null = null;
let currentRoot: string | null = null;

function findTab(path: string): Tab | undefined {
  return tabs.find((tab) => tab.filePath === path);
}
function activeTab(): Tab | undefined {
  return activeTabPath ? findTab(activeTabPath) : undefined;
}

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

// --- Tab bar rendering ---------------------------------------------------

function renderTabBar(): void {
  els.tabBar.innerHTML = "";
  for (const tab of tabs) {
    const row = document.createElement("div");
    row.className = "tab" + (tab.filePath === activeTabPath ? " active" : "");
    row.title = tab.filePath;

    const label = document.createElement("span");
    label.className = "tab-label";
    label.textContent = tab.filePath.split(/[\\/]/).pop() ?? tab.filePath;
    row.appendChild(label);

    if (tab.isDirty) {
      const dot = document.createElement("span");
      dot.className = "tab-dirty-dot";
      row.appendChild(dot);
    }

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "tab-close";
    closeBtn.textContent = "×";
    closeBtn.title = t("tab.closeTitle");
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void closeTab(tab.filePath);
    });
    row.appendChild(closeBtn);

    row.addEventListener("click", () => void activateTab(tab.filePath));
    els.tabBar.appendChild(row);
  }
}

function renderRecentMenu(): void {
  const recents = getRecents();
  els.menuRecentSection.hidden = recents.length === 0;
  els.menuRecent.innerHTML = "";
  for (const entry of recents) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = entry.label;
    btn.title = entry.path;
    btn.addEventListener("click", () => {
      if (entry.isFolder) void loadFolder(entry.path);
      else void openTabForFile(entry.path);
    });
    els.menuRecent.appendChild(btn);
  }
}

// --- Sidebar search ----------------------------------------------------

const SEARCH_DEBOUNCE_MS = 200;
let searchTimer: ReturnType<typeof setTimeout> | null = null;

async function readFileTextForSearch(path: string): Promise<string | null> {
  const openTab = findTab(path);
  if (openTab) return openTab.isEditing ? (openTab.editBuffer ?? openTab.text) : openTab.text;
  try {
    const bytes = await readFile(path);
    return decodeBytes(bytes, detectEncoding(bytes));
  } catch {
    return null;
  }
}

function renderSearchResults(query: string, results: SearchResult[]): void {
  els.sidebarSearchResults.innerHTML = "";
  if (!query.trim()) {
    const hint = document.createElement("div");
    hint.className = "search-empty";
    hint.textContent = t("sidebar.search.typeToSearch");
    els.sidebarSearchResults.appendChild(hint);
    return;
  }
  if (results.length === 0) {
    const empty = document.createElement("div");
    empty.className = "search-empty";
    empty.textContent = t("sidebar.search.noResults");
    els.sidebarSearchResults.appendChild(empty);
    return;
  }
  for (const result of results) {
    const fileLabel = document.createElement("div");
    fileLabel.className = "search-result-file";
    fileLabel.textContent = result.path.split(/[\\/]/).pop() ?? result.path;
    fileLabel.title = result.path;
    els.sidebarSearchResults.appendChild(fileLabel);
    for (const match of result.matches) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "search-result-match";
      btn.textContent = match.text || "…";
      btn.addEventListener("click", () => void openSearchResult(result.path, match.line));
      els.sidebarSearchResults.appendChild(btn);
    }
  }
}

async function openSearchResult(path: string, line: number): Promise<void> {
  await openTabForFile(path);
  const tab = activeTab();
  if (!tab) return;
  scrollToLine(tab.isEditing ? els.editPreview : els.preview, line);
}

async function runSearch(query: string): Promise<void> {
  if (!currentRoot) {
    renderSearchResults(query, []);
    return;
  }
  const rootName = await basename(currentRoot);
  const results = await searchInFiles(currentRoot, rootName, query, settings.showHidden, readFileTextForSearch);
  renderSearchResults(query, results);
}

// --- Per-tab state helpers -------------------------------------------------

function markDirty(tab: Tab): void {
  if (tab.isDirty) return;
  tab.isDirty = true;
  renderTabBar();
  updateEditUiState();
}

function captureTabViewState(tab: Tab): void {
  if (tab.isEditing) {
    if (editHandle) tab.editBuffer = editHandle.getValue();
    tab.scrollTop = els.editPreview.scrollTop;
  } else {
    tab.scrollTop = els.preview.scrollTop;
  }
}

function showTabContent(tab: Tab): void {
  if (tab.isEditing) {
    els.preview.hidden = true;
    els.editLayout.hidden = false;
    const initial = tab.editBuffer ?? tab.text;
    els.editPreview.innerHTML = renderMarkdown(initial, tab.baseDir);
    editHandle = createMarkdownEditor(
      els.editorPane,
      initial,
      (text) => {
        tab.editBuffer = text;
        markDirty(tab);
        if (editPreviewTimer) clearTimeout(editPreviewTimer);
        editPreviewTimer = setTimeout(() => {
          els.editPreview.innerHTML = renderMarkdown(text, tab.baseDir);
          updateStatusChips();
          updateOutline();
        }, EDIT_PREVIEW_DEBOUNCE_MS);
      },
      syncPreviewScrollToLine,
    );
    editHandle.focus();
    els.editPreview.scrollTop = tab.scrollTop;
  } else {
    els.editLayout.hidden = true;
    els.preview.hidden = false;
    els.preview.innerHTML = renderMarkdown(tab.text, tab.baseDir);
    els.preview.scrollTop = tab.scrollTop;
  }
}

function updateEditUiState(): void {
  const tab = activeTab();
  els.editBtn.disabled = !tab;
  els.editBtn.classList.toggle("active", !!tab?.isEditing);
  els.editBtn.title = t(tab?.isEditing ? "toolbar.edit.exit.title" : "toolbar.edit.title");
  els.dirtyIndicator.hidden = !tab?.isDirty;
  els.exportBtn.disabled = !tab;
}

function updateStatusChips(): void {
  const tab = activeTab();
  els.statusWordcount.hidden = !tab;
  els.statusEncoding.hidden = !tab;
  els.statusLineEnding.hidden = !tab;
  if (tab) {
    const sourceText = tab.isEditing ? (tab.editBuffer ?? tab.text) : tab.text;
    const wc = countWords(sourceText);
    els.statusWordcount.textContent = t("status.wordcount", {
      words: String(wc.words),
      minutes: String(wc.minutes),
    });
    els.statusEncoding.textContent = ENCODING_LABELS[tab.encoding];
    els.statusLineEnding.textContent = tab.lineEnding;
  }
}

function scrollToLine(container: HTMLElement, line: number): void {
  const candidates = container.querySelectorAll<HTMLElement>("[data-line]");
  let best: HTMLElement | null = null;
  for (const el of candidates) {
    if (Number(el.dataset.line) > line) break;
    best = el;
  }
  best?.scrollIntoView({ block: "start" });
}

function syncPreviewScrollToLine(line: number): void {
  scrollToLine(els.editPreview, line);
}

function scrollToSlug(slug: string): void {
  const tab = activeTab();
  const container = tab?.isEditing ? els.editPreview : els.preview;
  container.querySelector(`[id="${slug}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateOutline(): void {
  const tab = activeTab();
  const sourceText = tab ? (tab.isEditing ? (tab.editBuffer ?? tab.text) : tab.text) : "";
  const entries = tab ? extractOutline(sourceText) : [];
  els.outlineList.innerHTML = "";
  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "outline-empty";
    empty.textContent = t("outline.empty");
    els.outlineList.appendChild(empty);
    return;
  }
  for (const entry of entries) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "outline-item";
    btn.textContent = entry.text;
    btn.style.paddingLeft = `${12 + (entry.level - 1) * 12}px`;
    btn.addEventListener("click", () => scrollToSlug(entry.slug));
    els.outlineList.appendChild(btn);
  }
}

// --- Tab lifecycle -----------------------------------------------------

async function watchTab(tab: Tab): Promise<void> {
  tab.unwatch?.();
  tab.unwatch = null;
  if (!settings.autoReload || tab.isEditing) return;
  tab.unwatch = await watchImmediate(tab.filePath, () => {
    if (tab.ignoreNextExternalChange) {
      tab.ignoreNextExternalChange = false;
      return;
    }
    if (tab.reloadTimer) clearTimeout(tab.reloadTimer);
    tab.reloadTimer = setTimeout(() => void reloadTab(tab), RELOAD_DEBOUNCE_MS);
  });
}

async function reloadTab(tab: Tab): Promise<void> {
  if (tab.isEditing) return;
  try {
    const bytes = await readFile(tab.filePath);
    tab.encoding = detectEncoding(bytes);
    const text = decodeBytes(bytes, tab.encoding);
    tab.lineEnding = detectLineEnding(text);
    tab.text = text;
    if (activeTabPath === tab.filePath) {
      const scrollTop = els.preview.scrollTop;
      els.preview.innerHTML = renderMarkdown(text, tab.baseDir);
      els.preview.scrollTop = scrollTop;
      updateStatusChips();
      updateOutline();
    }
  } catch {
    // The file may have been removed or is mid-write; keep showing the last good render.
  }
}

async function openTabForFile(filePath: string): Promise<void> {
  const existing = findTab(filePath);
  if (existing) {
    await activateTab(filePath);
    addRecent(filePath, false);
    return;
  }
  try {
    const bytes = await readFile(filePath);
    const encoding = detectEncoding(bytes);
    const text = decodeBytes(bytes, encoding);
    const baseDir = await dirname(filePath);
    const tab: Tab = {
      filePath,
      text,
      baseDir,
      encoding,
      lineEnding: detectLineEnding(text),
      isEditing: false,
      isDirty: false,
      editBuffer: null,
      scrollTop: 0,
      unwatch: null,
      reloadTimer: null,
      ignoreNextExternalChange: false,
    };
    tabs.push(tab);
    await watchTab(tab);
    await activateTab(filePath);
    addRecent(filePath, false);
  } catch (err) {
    els.statusLeft.textContent = t("status.openError", { error: String(err) });
  }
}

async function activateTab(filePath: string): Promise<void> {
  const next = findTab(filePath);
  if (!next || activeTabPath === filePath) return;

  const prev = activeTab();
  if (prev) captureTabViewState(prev);
  editHandle?.destroy();
  editHandle = null;

  activeTabPath = filePath;
  setActiveFile(filePath);
  els.emptyState.hidden = true;
  els.breadcrumb.textContent = await buildBreadcrumb(filePath);
  localStorage.setItem(LAST_FILE_KEY, filePath);
  showTabContent(next);
  renderTabBar();
  updateStatusChips();
  updateOutline();
  updateEditUiState();
}

async function closeTab(filePath: string): Promise<void> {
  const tab = findTab(filePath);
  if (!tab) return;
  if (tab.isDirty && !window.confirm(t("edit.confirmDiscard"))) return;

  tab.unwatch?.();
  const idx = tabs.indexOf(tab);
  tabs.splice(idx, 1);

  if (activeTabPath !== filePath) {
    renderTabBar();
    return;
  }

  editHandle?.destroy();
  editHandle = null;
  activeTabPath = null;
  const nextTab = tabs[idx] ?? tabs[idx - 1];
  if (nextTab) await activateTab(nextTab.filePath);
  else showEmptyState();
}

async function toggleEditMode(): Promise<void> {
  const tab = activeTab();
  if (!tab) return;
  if (tab.isEditing) {
    if (tab.isDirty && !window.confirm(t("edit.confirmDiscard"))) return;
    tab.isEditing = false;
    tab.isDirty = false;
    tab.editBuffer = null;
    tab.ignoreNextExternalChange = false;
    editHandle?.destroy();
    editHandle = null;
    showTabContent(tab);
    await watchTab(tab);
  } else {
    tab.isEditing = true;
    tab.editBuffer = tab.editBuffer ?? tab.text;
    tab.unwatch?.();
    tab.unwatch = null;
    showTabContent(tab);
  }
  renderTabBar();
  updateEditUiState();
}

async function saveActiveTab(): Promise<void> {
  const tab = activeTab();
  if (!tab || !tab.isEditing || !editHandle) return;
  const text = applyLineEnding(editHandle.getValue(), tab.lineEnding);
  const bytes = encodeText(text, tab.encoding);
  tab.ignoreNextExternalChange = true;
  await writeFile(tab.filePath, bytes);
  tab.text = text;
  tab.editBuffer = text;
  tab.isDirty = false;
  renderTabBar();
  updateEditUiState();
}

async function exportAs(format: ExportFormat): Promise<void> {
  const tab = activeTab();
  if (!tab) return;
  if (format === "pdf") {
    window.print();
    return;
  }

  const sourceText = tab.isEditing && editHandle ? editHandle.getValue() : tab.text;
  const base = (await basename(tab.filePath)).replace(/\.[^.]+$/, "");

  try {
    if (format === "txt") {
      const path = await save({ defaultPath: `${base}.txt`, filters: [{ name: "Text", extensions: ["txt"] }] });
      if (!path) return;
      await writeTextFile(path, markdownToPlainText(sourceText));
    } else if (format === "html") {
      const path = await save({ defaultPath: `${base}.html`, filters: [{ name: "HTML", extensions: ["html"] }] });
      if (!path) return;
      const bodyHtml = renderMarkdown(sourceText, tab.baseDir);
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

// --- Folder / file opening -----------------------------------------------

async function openFolder(): Promise<void> {
  const selected = await open({ directory: true, multiple: false });
  if (!selected || Array.isArray(selected)) return;
  await loadFolder(selected);
}

async function openFile(): Promise<void> {
  const selected = await open({ multiple: false, filters: MD_FILTER });
  if (!selected || Array.isArray(selected)) return;
  if (!currentRoot) {
    const dir = await dirname(selected);
    await loadFolder(dir, selected);
  } else {
    await openTabForFile(selected);
  }
}

async function handleDroppedPaths(paths: string[]): Promise<void> {
  for (const path of paths) {
    let isDirectory = true;
    try {
      await readDir(path);
    } catch {
      isDirectory = false;
    }
    if (isDirectory) {
      await loadFolder(path);
    } else if (MD_FILTER[0].extensions.some((ext) => path.toLowerCase().endsWith(`.${ext}`))) {
      await openTabForFile(path);
    }
  }
}

function setupDragDrop(): void {
  void getCurrentWebview().onDragDropEvent((event) => {
    const kind = event.payload.type;
    if (kind === "drop") {
      document.documentElement.classList.remove("drag-over");
      void handleDroppedPaths(event.payload.paths);
    } else if (kind === "enter" || kind === "over") {
      document.documentElement.classList.add("drag-over");
    } else {
      document.documentElement.classList.remove("drag-over");
    }
  });
}

async function loadFolder(rootPath: string, initialFile?: string): Promise<void> {
  currentRoot = rootPath;
  localStorage.setItem(LAST_ROOT_KEY, rootPath);
  addRecent(rootPath, true);
  const rootName = await basename(rootPath);
  els.sidebarTitle.textContent = rootName.toUpperCase();
  els.statusLeft.textContent = t("status.scanning");

  const tree = await buildTree(rootPath, rootName, settings.showHidden);
  renderTree(tree, els.fileTree, { onSelectFile: (path) => void openTabForFile(path) });

  const target = initialFile ?? findFirstFile(tree)?.path ?? null;
  if (target) {
    await openTabForFile(target);
  } else if (tabs.length === 0) {
    els.statusLeft.textContent = t("status.noMarkdown");
  }
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
  els.editLayout.hidden = true;
  els.breadcrumb.textContent = "";
  activeTabPath = null;
  renderTabBar();
  updateEditUiState();
  updateStatusChips();
  updateOutline();
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

// --- Event wiring ----------------------------------------------------------

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
  const tab = activeTab();
  if (!button || !tab) return;
  tab.encoding = button.dataset.encoding as TextEncodingId;
  updateStatusChips();
  if (tab.isEditing) markDirty(tab);
});

setupDropdown(els.statusLineEnding, els.lineEndingMenu);
els.lineEndingMenu.addEventListener("click", (e) => {
  const button = (e.target as HTMLElement).closest<HTMLElement>("[data-line-ending]");
  const tab = activeTab();
  if (!button || !tab) return;
  tab.lineEnding = button.dataset.lineEnding as LineEnding;
  updateStatusChips();
  if (tab.isEditing) markDirty(tab);
});

els.menuFileBtn.addEventListener("click", renderRecentMenu);
setupDropdown(els.menuFileBtn, els.menuFile);
els.menuFile.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const exportBtn = target.closest<HTMLElement>("[data-export]");
  if (exportBtn) {
    void exportAs(exportBtn.dataset.export as ExportFormat);
    return;
  }
  const actionBtn = target.closest<HTMLElement>("[data-action]");
  if (!actionBtn) return;
  switch (actionBtn.dataset.action) {
    case "open-file":
      void openFile();
      break;
    case "open-folder":
      void openFolder();
      break;
    case "save":
      void saveActiveTab();
      break;
    case "close-tab":
      if (activeTabPath) void closeTab(activeTabPath);
      break;
  }
});

setupDropdown(els.menuViewBtn, els.menuView);
els.menuView.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const themeBtn = target.closest<HTMLElement>("[data-theme-choice]");
  if (themeBtn) {
    settings.theme = themeBtn.dataset.themeChoice as ThemeMode;
    saveSettings(settings);
    applySettings(settings);
    return;
  }
  const actionBtn = target.closest<HTMLElement>("[data-action]");
  if (!actionBtn) return;
  switch (actionBtn.dataset.action) {
    case "toggle-sidebar":
      els.body.classList.toggle("sidebar-hidden");
      break;
    case "toggle-outline":
      els.outlinePanel.hidden = !els.outlinePanel.hidden;
      break;
    case "open-settings":
      els.settingsBtn.click();
      break;
  }
});

setupDropdown(els.menuHelpBtn, els.menuHelp);
els.menuHelp.addEventListener("click", (e) => {
  const actionBtn = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (actionBtn?.dataset.action === "open-repo") void openUrl(REPO_URL);
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
    void saveActiveTab();
  } else if (key === "w") {
    e.preventDefault();
    if (activeTabPath) void closeTab(activeTabPath);
  }
});

initSettingsPanel(settings, {
  onLanguageChange: () => {
    updateEditUiState();
    renderTabBar();
  },
  onShowHiddenChange: () => {
    if (currentRoot) void loadFolder(currentRoot, activeTabPath ?? undefined);
  },
  onAutoReloadChange: () => {
    for (const tab of tabs) void watchTab(tab);
  },
});

els.sidebarSearchToggle.addEventListener("click", () => {
  const showingSearch = els.sidebarSearch.hidden;
  els.sidebarSearch.hidden = !showingSearch;
  els.fileTree.hidden = showingSearch;
  if (showingSearch) {
    els.sidebarSearchInput.focus();
    renderSearchResults(els.sidebarSearchInput.value, []);
  }
});
els.sidebarSearchInput.addEventListener("input", () => {
  const query = els.sidebarSearchInput.value;
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void runSearch(query), SEARCH_DEBOUNCE_MS);
});

applyTranslations();
setupResizer(document.querySelector<HTMLDivElement>("#resizer")!, document.querySelector<HTMLDivElement>("#sidebar")!);
setupResizer(document.querySelector<HTMLDivElement>("#edit-resizer")!, els.editorColumn);
setupDragDrop();
void restoreLastSession();
