import { open, save } from "@tauri-apps/plugin-dialog";
import {
  readFile,
  readDir,
  writeFile,
  writeTextFile,
  exists,
  watchImmediate,
  mkdir,
  remove,
  rename,
  type UnwatchFn,
} from "@tauri-apps/plugin-fs";
import { basename, dirname, sep, join } from "@tauri-apps/api/path";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { renderMarkdown, extractOutline, mermaidSources } from "./markdown";
import { renderMermaidBlocks } from "./mermaidRender";
import { buildTree, findFirstFile, type TreeNode } from "./fileTree";
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
import { getFavorites, isFavorite, toggleFavorite } from "./favorites";
import { getSnapshots, addSnapshot, clearHistory, type Snapshot } from "./history";
import { findBacklinks, type Backlink } from "./backlinks";
import { diffLines } from "./diff";
import { searchInFiles, replaceInFiles, flattenFiles, type SearchResult } from "./search";
import { checkForUpdate, installPendingUpdate } from "./updater";
import { dismissRatingPromptForever, recordLaunch, shouldShowRatingPrompt, snoozeRatingPrompt } from "./appRating";
import { fuzzyFilter } from "./fuzzy";
import { getGitStatus, type GitStatusResult, type GitFileStatusKind } from "./git";
import { loadShortcuts, matchesCombo, formatCombo } from "./shortcuts";

const LAST_ROOT_KEY = "mdviewer.lastRoot";
const LAST_FILE_KEY = "mdviewer.lastFile";
const MD_FILTER = [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] }];
const RELOAD_DEBOUNCE_MS = 150;
const EDIT_PREVIEW_DEBOUNCE_MS = 120;
const REPO_URL = "https://github.com/TarducciM/MD-Viewer";
const UPDATE_CHECK_DELAY_MS = 3000;
const PASTED_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

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
  menuWindowBtn: document.querySelector<HTMLButtonElement>("#menu-window-btn")!,
  menuWindow: document.querySelector<HTMLDivElement>("#menu-window")!,
  menuHelpBtn: document.querySelector<HTMLButtonElement>("#menu-help-btn")!,
  menuHelp: document.querySelector<HTMLDivElement>("#menu-help")!,
  openFolderBtn: document.querySelector<HTMLButtonElement>("#open-folder-btn")!,
  openFileBtn: document.querySelector<HTMLButtonElement>("#open-file-btn")!,
  emptyOpenFolderBtn: document.querySelector<HTMLButtonElement>("#empty-open-folder-btn")!,
  emptyOpenFileBtn: document.querySelector<HTMLButtonElement>("#empty-open-file-btn")!,
  app: document.querySelector<HTMLDivElement>("#app")!,
  body: document.querySelector<HTMLDivElement>("#body")!,
  sidebar: document.querySelector<HTMLDivElement>("#sidebar")!,
  fileTree: document.querySelector<HTMLDivElement>("#file-tree")!,
  treeContextMenu: document.querySelector<HTMLDivElement>("#tree-context-menu")!,
  favoritesSection: document.querySelector<HTMLDivElement>("#sidebar-favorites-section")!,
  favoritesList: document.querySelector<HTMLDivElement>("#sidebar-favorites-list")!,
  historyOverlay: document.querySelector<HTMLDivElement>("#history-overlay")!,
  historyList: document.querySelector<HTMLDivElement>("#history-list")!,
  historyCloseBtn: document.querySelector<HTMLButtonElement>("#history-close-btn")!,
  historyClearBtn: document.querySelector<HTMLButtonElement>("#history-clear-btn")!,
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
  outlineHeader: document.querySelector<HTMLDivElement>("#outline-header")!,
  outlineList: document.querySelector<HTMLDivElement>("#outline-list")!,
  sidebarSearchToggle: document.querySelector<HTMLButtonElement>("#sidebar-search-toggle")!,
  sidebarSearch: document.querySelector<HTMLDivElement>("#sidebar-search")!,
  sidebarSearchInput: document.querySelector<HTMLInputElement>("#sidebar-search-input")!,
  sidebarSearchResults: document.querySelector<HTMLDivElement>("#sidebar-search-results")!,
  sidebarReplaceToggle: document.querySelector<HTMLButtonElement>("#sidebar-replace-toggle")!,
  sidebarReplaceRow: document.querySelector<HTMLDivElement>("#sidebar-replace-row")!,
  sidebarReplaceInput: document.querySelector<HTMLInputElement>("#sidebar-replace-input")!,
  sidebarReplaceAllBtn: document.querySelector<HTMLButtonElement>("#sidebar-replace-all-btn")!,
  updateBanner: document.querySelector<HTMLDivElement>("#update-banner")!,
  updateBannerText: document.querySelector<HTMLSpanElement>("#update-banner-text")!,
  updateBannerAction: document.querySelector<HTMLButtonElement>("#update-banner-action")!,
  updateBannerDismiss: document.querySelector<HTMLButtonElement>("#update-banner-dismiss")!,
  ratingBanner: document.querySelector<HTMLDivElement>("#rating-banner")!,
  ratingBannerRate: document.querySelector<HTMLButtonElement>("#rating-banner-rate")!,
  ratingBannerLater: document.querySelector<HTMLButtonElement>("#rating-banner-later")!,
  ratingBannerNever: document.querySelector<HTMLButtonElement>("#rating-banner-never")!,
  commandPaletteOverlay: document.querySelector<HTMLDivElement>("#command-palette-overlay")!,
  commandPaletteInput: document.querySelector<HTMLInputElement>("#command-palette-input")!,
  commandPaletteList: document.querySelector<HTMLDivElement>("#command-palette-list")!,
  gitPanel: document.querySelector<HTMLDivElement>("#git-panel")!,
  gitHeader: document.querySelector<HTMLDivElement>("#git-header")!,
  gitBranch: document.querySelector<HTMLSpanElement>("#git-branch")!,
  gitList: document.querySelector<HTMLDivElement>("#git-list")!,
  gitRefreshBtn: document.querySelector<HTMLButtonElement>("#git-refresh-btn")!,
  backlinksPanel: document.querySelector<HTMLDivElement>("#backlinks-panel")!,
  backlinksHeader: document.querySelector<HTMLDivElement>("#backlinks-header")!,
  backlinksList: document.querySelector<HTMLDivElement>("#backlinks-list")!,
  bodyRow: document.querySelector<HTMLDivElement>("#body-row")!,
  bodyBottom: document.querySelector<HTMLDivElement>("#body-bottom")!,
  bodyBottomResizer: document.querySelector<HTMLDivElement>("#body-bottom-resizer")!,
  dockZoneIndicator: document.querySelector<HTMLDivElement>("#dock-zone-indicator")!,
  contentColumnSecondary: document.querySelector<HTMLDivElement>("#content-column-secondary")!,
  splitResizer: document.querySelector<HTMLDivElement>("#split-resizer")!,
  splitTabSelect: document.querySelector<HTMLSelectElement>("#split-tab-select")!,
  splitCloseBtn: document.querySelector<HTMLButtonElement>("#split-close-btn")!,
  splitDiffToggle: document.querySelector<HTMLButtonElement>("#split-diff-toggle")!,
  previewSecondary: document.querySelector<HTMLElement>("#markdown-preview-secondary")!,
  diffView: document.querySelector<HTMLDivElement>("#diff-view")!,
};

const settings: Settings = loadSettings();
setLanguage(settings.language);
applySettings(settings);
let shortcuts: Record<string, string> = loadShortcuts();

const tabs: Tab[] = [];
let activeTabPath: string | null = null;
let editHandle: MarkdownEditorHandle | null = null;
let editPreviewTimer: ReturnType<typeof setTimeout> | null = null;
let currentRoot: string | null = null;
const closedTabPaths: string[] = [];
const MAX_CLOSED_TABS = 10;

function findTab(path: string): Tab | undefined {
  return tabs.find((tab) => tab.filePath === path);
}
function activeTab(): Tab | undefined {
  return activeTabPath ? findTab(activeTabPath) : undefined;
}

function setupVerticalResizer(handleEl: HTMLElement, targetEl: HTMLElement): void {
  handleEl.addEventListener("mousedown", (downEvent) => {
    const startY = downEvent.clientY;
    const startHeight = targetEl.getBoundingClientRect().height;
    const onMove = (e: MouseEvent) => {
      const height = Math.min(window.innerHeight * 0.6, Math.max(120, startHeight - (e.clientY - startY)));
      targetEl.style.height = `${height}px`;
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

function setupResizer(handleEl: HTMLElement, targetEl: HTMLElement, growOnRight = true): void {
  handleEl.addEventListener("mousedown", (downEvent) => {
    const startX = downEvent.clientX;
    const startWidth = targetEl.getBoundingClientRect().width;
    const parentWidth = targetEl.parentElement!.getBoundingClientRect().width;
    const sign = growOnRight ? 1 : -1;
    const onMove = (e: MouseEvent) => {
      const width = Math.min(parentWidth * 0.8, Math.max(160, startWidth + sign * (e.clientX - startX)));
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
dropdownMenus.push(els.treeContextMenu);

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

function renderFavorites(): void {
  const favorites = getFavorites();
  els.favoritesSection.hidden = favorites.length === 0;
  els.favoritesList.innerHTML = "";
  for (const entry of favorites) {
    const row = document.createElement("div");
    row.className = "favorite-row";
    row.title = entry.path;

    const label = document.createElement("span");
    label.className = "favorite-row-label";
    label.textContent = entry.label;
    label.addEventListener("click", () => void openTabForFile(entry.path));
    row.appendChild(label);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "favorite-row-remove";
    removeBtn.textContent = "×";
    removeBtn.title = t("tree.unfavorite");
    removeBtn.addEventListener("click", () => {
      toggleFavorite(entry.path);
      renderFavorites();
    });
    row.appendChild(removeBtn);

    els.favoritesList.appendChild(row);
  }
}

// --- Local edit history --------------------------------------------------

function previewLine(content: string): string {
  const line = content.split("\n").find((l) => l.trim().length > 0) ?? "";
  return line.trim().slice(0, 80);
}

function renderHistoryList(): void {
  const tab = activeTab();
  els.historyList.innerHTML = "";
  if (!tab) return;
  const snapshots = getSnapshots(tab.filePath);
  if (snapshots.length === 0) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = t("history.empty");
    els.historyList.appendChild(empty);
    return;
  }
  for (const snap of snapshots) {
    const row = document.createElement("div");
    row.className = "history-row";

    const info = document.createElement("div");
    info.className = "history-row-info";
    const time = document.createElement("div");
    time.className = "history-row-time";
    time.textContent = new Date(snap.timestamp).toLocaleString();
    info.appendChild(time);
    const preview = document.createElement("div");
    preview.className = "history-row-preview";
    preview.textContent = previewLine(snap.content);
    info.appendChild(preview);
    row.appendChild(info);

    const restoreBtn = document.createElement("button");
    restoreBtn.type = "button";
    restoreBtn.className = "history-row-restore";
    restoreBtn.textContent = t("history.restore");
    restoreBtn.addEventListener("click", () => void restoreSnapshot(tab, snap));
    row.appendChild(restoreBtn);

    els.historyList.appendChild(row);
  }
}

async function restoreSnapshot(tab: Tab, snap: Snapshot): Promise<void> {
  if (!window.confirm(t("history.confirmRestore"))) return;
  closeHistory();
  if (!tab.isEditing) {
    tab.isEditing = true;
    tab.unwatch?.();
    tab.unwatch = null;
  }
  tab.editBuffer = snap.content;
  markDirty(tab);
  if (activeTabPath === tab.filePath) {
    showTabContent(tab);
    updateStatusChips();
    updateOutline();
    refreshSplitView();
  }
}

function openHistory(): void {
  if (!activeTab()) return;
  renderHistoryList();
  els.historyOverlay.hidden = false;
}

function closeHistory(): void {
  els.historyOverlay.hidden = true;
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

// Skips files currently open for editing (returns null so replaceInFiles
// skips them) to avoid silently clobbering unsaved buffer content on disk.
async function readFileTextForReplace(path: string): Promise<string | null> {
  const openTab = findTab(path);
  if (openTab?.isEditing) return null;
  if (openTab) return openTab.text;
  try {
    const bytes = await readFile(path);
    return decodeBytes(bytes, detectEncoding(bytes));
  } catch {
    return null;
  }
}

async function writeFileTextForReplace(path: string, content: string): Promise<void> {
  const openTab = findTab(path);
  const encoding: TextEncodingId = openTab?.encoding ?? "utf-8";
  const lineEnding: LineEnding = openTab?.lineEnding ?? "LF";
  const finalText = applyLineEnding(content, lineEnding);
  const bytes = encodeText(finalText, encoding);
  if (openTab) openTab.ignoreNextExternalChange = true;
  await writeFile(path, bytes);
  if (openTab) {
    openTab.text = finalText;
    addSnapshot(path, finalText, Date.now());
    if (activeTabPath === path && !openTab.isEditing) {
      els.preview.innerHTML = renderMarkdown(finalText, openTab.baseDir);
      void renderMermaidBlocks(els.preview, mermaidSources);
      void markWikiLinks(els.preview);
      updateOutline();
    }
  }
}

async function handleReplaceAll(): Promise<void> {
  const query = els.sidebarSearchInput.value;
  const replacement = els.sidebarReplaceInput.value;
  if (!query.trim() || !currentRoot) return;

  const rootName = await basename(currentRoot);
  const preview = await searchInFiles(currentRoot, rootName, query, settings.showHidden, readFileTextForReplace);
  const totalCount = preview.reduce((sum, r) => sum + r.matches.length, 0);
  if (preview.length === 0) {
    window.alert(t("sidebar.replace.none"));
    return;
  }

  const confirmed = window.confirm(
    t("sidebar.replace.confirm", { count: String(totalCount), files: String(preview.length) }),
  );
  if (!confirmed) return;

  const results = await replaceInFiles(
    currentRoot,
    rootName,
    query,
    replacement,
    settings.showHidden,
    readFileTextForReplace,
    writeFileTextForReplace,
  );
  const replacedCount = results.reduce((sum, r) => sum + r.count, 0);
  window.alert(t("sidebar.replace.done", { count: String(replacedCount), files: String(results.length) }));
  void runSearch(query);
  if (!els.gitPanel.hidden) void refreshGitPanel();
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

async function handleEditorImagePaste(tab: Tab, blob: Blob): Promise<string | null> {
  const ext = PASTED_IMAGE_EXTENSIONS[blob.type] ?? "png";
  const filename = `pasted-image-${Date.now()}.${ext}`;
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await writeFile(await join(tab.baseDir, filename), bytes);
    return `![](${filename})`;
  } catch {
    return null;
  }
}

function showTabContent(tab: Tab): void {
  if (tab.isEditing) {
    els.preview.hidden = true;
    els.editLayout.hidden = false;
    const initial = tab.editBuffer ?? tab.text;
    els.editPreview.innerHTML = renderMarkdown(initial, tab.baseDir);
    void renderMermaidBlocks(els.editPreview, mermaidSources);
    void markWikiLinks(els.editPreview);
    editHandle = createMarkdownEditor(
      els.editorPane,
      initial,
      (text) => {
        tab.editBuffer = text;
        markDirty(tab);
        if (editPreviewTimer) clearTimeout(editPreviewTimer);
        editPreviewTimer = setTimeout(() => {
          els.editPreview.innerHTML = renderMarkdown(text, tab.baseDir);
          void renderMermaidBlocks(els.editPreview, mermaidSources);
          void markWikiLinks(els.editPreview);
          updateStatusChips();
          updateOutline();
          refreshSplitView();
        }, EDIT_PREVIEW_DEBOUNCE_MS);
      },
      syncPreviewScrollToLine,
      (blob) => handleEditorImagePaste(tab, blob),
    );
    editHandle.focus();
    els.editPreview.scrollTop = tab.scrollTop;
  } else {
    els.editLayout.hidden = true;
    els.preview.hidden = false;
    els.preview.innerHTML = renderMarkdown(tab.text, tab.baseDir);
    void renderMermaidBlocks(els.preview, mermaidSources);
    void markWikiLinks(els.preview);
    els.preview.scrollTop = tab.scrollTop;
  }
}

function updateEditUiState(): void {
  const tab = activeTab();
  els.editBtn.disabled = !tab;
  els.editBtn.classList.toggle("active", !!tab?.isEditing);
  els.editBtn.title =
    t(tab?.isEditing ? "toolbar.edit.exit.title" : "toolbar.edit.title") + shortcutSuffix("toggle-edit");
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

// --- Wiki-links [[note]] --------------------------------------------------

function resolveWikiLink(target: string, files: TreeNode[]): string | null {
  const wanted = target.split("#")[0].trim().toLowerCase();
  if (!wanted) return null;
  return files.find((file) => file.name.replace(/\.[^.]+$/, "").toLowerCase() === wanted)?.path ?? null;
}

async function currentTreeFiles(): Promise<TreeNode[]> {
  if (!currentRoot) return [];
  const rootName = await basename(currentRoot);
  const tree = await buildTree(currentRoot, rootName, settings.showHidden);
  return flattenFiles(tree);
}

async function markWikiLinks(container: HTMLElement): Promise<void> {
  const links = Array.from(container.querySelectorAll<HTMLAnchorElement>("a.wiki-link"));
  if (links.length === 0) return;
  const files = await currentTreeFiles();
  for (const link of links) {
    const found = resolveWikiLink(link.dataset.wikiTarget ?? "", files);
    link.classList.toggle("wiki-link-missing", !found);
  }
}

async function openWikiLink(target: string): Promise<void> {
  const path = resolveWikiLink(target, await currentTreeFiles());
  if (path) await openTabForFile(path);
}

// --- Git panel -------------------------------------------------------------

const GIT_STATUS_BADGE: Record<GitFileStatusKind, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  untracked: "U",
  renamed: "R",
  other: "?",
};
const MD_PATH_RE = /\.(md|markdown|mdown|mkd)$/i;

function renderGitPanel(result: GitStatusResult): void {
  els.gitBranch.textContent = result.branch ? `⎇ ${result.branch}` : "";
  els.gitList.innerHTML = "";

  if (!result.isRepo) {
    const empty = document.createElement("div");
    empty.className = "git-empty";
    empty.textContent = t("git.notRepo");
    els.gitList.appendChild(empty);
    return;
  }
  if (result.files.length === 0) {
    const empty = document.createElement("div");
    empty.className = "git-empty";
    empty.textContent = t("git.noChanges");
    els.gitList.appendChild(empty);
    return;
  }

  for (const file of result.files) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "git-row";
    row.title = file.path;

    const badge = document.createElement("span");
    badge.className = `git-status-badge git-status-${file.status}`;
    badge.textContent = GIT_STATUS_BADGE[file.status];
    row.appendChild(badge);

    const pathEl = document.createElement("span");
    pathEl.className = "git-row-path";
    pathEl.textContent = file.path;
    row.appendChild(pathEl);

    if (MD_PATH_RE.test(file.path)) {
      row.addEventListener("click", () => {
        if (!currentRoot) return;
        void join(currentRoot, file.path).then((fullPath) => openTabForFile(fullPath));
      });
    } else {
      row.disabled = true;
    }
    els.gitList.appendChild(row);
  }
}

async function refreshGitPanel(): Promise<void> {
  if (!currentRoot) {
    renderGitPanel({ isRepo: false, branch: null, files: [] });
    return;
  }
  renderGitPanel(await getGitStatus(currentRoot));
}

function toggleGitPanel(): void {
  const wasHidden = els.gitPanel.hidden;
  els.gitPanel.hidden = !wasHidden;
  if (wasHidden) void refreshGitPanel();
  updateBodyBottomVisibility();
}

function renderBacklinksPanel(results: Backlink[], noFile: boolean): void {
  els.backlinksList.innerHTML = "";
  if (noFile || results.length === 0) {
    const empty = document.createElement("div");
    empty.className = "backlink-empty";
    empty.textContent = t(noFile ? "backlinks.noFile" : "backlinks.empty");
    els.backlinksList.appendChild(empty);
    return;
  }

  const byPath = new Map<string, Backlink[]>();
  for (const result of results) {
    const list = byPath.get(result.path) ?? [];
    list.push(result);
    byPath.set(result.path, list);
  }

  for (const [path, matches] of byPath) {
    const group = document.createElement("div");
    group.className = "backlink-group";
    group.textContent = path.split(/[\\/]/).pop() ?? path;
    group.title = path;
    els.backlinksList.appendChild(group);

    for (const match of matches) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "backlink-row";
      btn.textContent = match.text || "…";
      btn.addEventListener("click", () => {
        void openTabForFile(path).then(() => {
          const opened = activeTab();
          if (opened) scrollToLine(opened.isEditing ? els.editPreview : els.preview, match.line);
        });
      });
      els.backlinksList.appendChild(btn);
    }
  }
}

async function refreshBacklinksPanel(): Promise<void> {
  const tab = activeTab();
  if (!tab || !currentRoot) {
    renderBacklinksPanel([], true);
    return;
  }
  const rootName = await basename(currentRoot);
  const results = await findBacklinks(currentRoot, rootName, tab.filePath, settings.showHidden, readFileTextForSearch);
  renderBacklinksPanel(results, false);
}

function toggleBacklinksPanel(): void {
  const wasHidden = els.backlinksPanel.hidden;
  els.backlinksPanel.hidden = !wasHidden;
  if (wasHidden) void refreshBacklinksPanel();
  updateBodyBottomVisibility();
}

function toggleOutlinePanel(): void {
  els.outlinePanel.hidden = !els.outlinePanel.hidden;
  updateBodyBottomVisibility();
}

// --- Dockable side panels ------------------------------------------------

type DockPosition = "left" | "right" | "bottom";

function updateBodyBottomVisibility(): void {
  const hasVisibleChild = Array.from(els.bodyBottom.children).some((el) => !(el as HTMLElement).hidden);
  els.bodyBottom.hidden = !hasVisibleChild;
  els.bodyBottomResizer.hidden = !hasVisibleChild;
}

function setPanelDock(panel: HTMLElement, position: DockPosition): void {
  panel.classList.remove("docked-left", "docked-bottom");
  if (position === "bottom") {
    panel.classList.add("docked-bottom");
    els.bodyBottom.appendChild(panel);
  } else {
    if (position === "left") panel.classList.add("docked-left");
    els.bodyRow.appendChild(panel);
    if (position === "left") els.bodyRow.insertBefore(panel, els.bodyRow.firstChild);
  }
  updateBodyBottomVisibility();
}

function detectDockZone(clientX: number, clientY: number): DockPosition | null {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (clientY > h * 0.78) return "bottom";
  if (clientX < w * 0.12) return "left";
  if (clientX > w * 0.88) return "right";
  return null;
}

function showDockZoneIndicator(zone: DockPosition | null): void {
  const el = els.dockZoneIndicator;
  if (!zone) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.style.left = zone === "right" ? "auto" : "0";
  el.style.right = zone === "right" ? "0" : "auto";
  el.style.top = zone === "bottom" ? "auto" : "0";
  el.style.bottom = zone === "bottom" ? "0" : "auto";
  el.style.width = zone === "bottom" ? "100%" : "240px";
  el.style.height = zone === "bottom" ? "220px" : "100%";
}

function setupPanelDrag(header: HTMLElement, panel: HTMLElement, label: string): void {
  header.addEventListener("mousedown", (downEvent) => {
    if ((downEvent.target as HTMLElement).closest("button")) return;
    downEvent.preventDefault();

    let zone: DockPosition | null = null;
    header.classList.add("dragging");
    document.body.classList.add("panel-dragging");
    const ghost = document.createElement("div");
    ghost.className = "panel-drag-ghost";
    ghost.textContent = label;
    document.body.appendChild(ghost);
    ghost.style.left = `${downEvent.clientX}px`;
    ghost.style.top = `${downEvent.clientY}px`;

    const onMove = (e: MouseEvent) => {
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
      zone = detectDockZone(e.clientX, e.clientY);
      showDockZoneIndicator(zone);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      header.classList.remove("dragging");
      document.body.classList.remove("panel-dragging");
      ghost.remove();
      showDockZoneIndicator(null);
      if (zone) setPanelDock(panel, zone);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

// --- Split view --------------------------------------------------------

function renderSplitTabOptions(): void {
  const previousValue = els.splitTabSelect.value;
  els.splitTabSelect.innerHTML = "";
  for (const tab of tabs) {
    const option = document.createElement("option");
    option.value = tab.filePath;
    option.textContent = tab.filePath.split(/[\\/]/).pop() ?? tab.filePath;
    els.splitTabSelect.appendChild(option);
  }
  const stillOpen = tabs.some((tab) => tab.filePath === previousValue);
  els.splitTabSelect.value = stillOpen ? previousValue : (activeTabPath ?? tabs[0]?.filePath ?? "");
}

function tabSourceText(tab: Tab): string {
  return tab.isEditing ? (tab.editBuffer ?? tab.text) : tab.text;
}

let diffModeActive = false;
const DIFF_MAX_CELLS = 4_000_000;

function renderDiffView(): void {
  const primary = activeTab();
  const secondary = findTab(els.splitTabSelect.value);
  els.diffView.innerHTML = "";
  if (!primary || !secondary) return;

  const showMessage = (key: string) => {
    const empty = document.createElement("div");
    empty.className = "diff-empty";
    empty.textContent = t(key);
    els.diffView.appendChild(empty);
  };

  if (primary.filePath === secondary.filePath) {
    showMessage("diff.selectAnotherFile");
    return;
  }

  const linesA = tabSourceText(primary).split(/\r\n|\r|\n/);
  const linesB = tabSourceText(secondary).split(/\r\n|\r|\n/);
  if (linesA.length * linesB.length > DIFF_MAX_CELLS) {
    showMessage("diff.tooLarge");
    return;
  }

  const diff = diffLines(linesA, linesB);
  if (diff.every((entry) => entry.type === "same")) {
    showMessage("diff.identical");
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const entry of diff) {
    const row = document.createElement("div");
    row.className = `diff-line diff-line-${entry.type}`;
    const marker = document.createElement("span");
    marker.className = "diff-line-marker";
    marker.textContent = entry.type === "add" ? "+" : entry.type === "remove" ? "−" : "";
    row.appendChild(marker);
    const text = document.createElement("span");
    text.textContent = entry.text;
    row.appendChild(text);
    fragment.appendChild(row);
  }
  els.diffView.appendChild(fragment);
}

function renderSplitPreview(): void {
  if (diffModeActive) {
    renderDiffView();
    return;
  }
  const tab = findTab(els.splitTabSelect.value);
  if (!tab) {
    els.previewSecondary.innerHTML = "";
    return;
  }
  els.previewSecondary.innerHTML = renderMarkdown(tabSourceText(tab), tab.baseDir);
  void renderMermaidBlocks(els.previewSecondary, mermaidSources);
  void markWikiLinks(els.previewSecondary);
}

function setDiffMode(active: boolean): void {
  diffModeActive = active;
  els.splitDiffToggle.classList.toggle("active", active);
  els.previewSecondary.hidden = active;
  els.diffView.hidden = !active;
  renderSplitPreview();
}

function refreshSplitView(): void {
  if (els.contentColumnSecondary.hidden) return;
  renderSplitTabOptions();
  renderSplitPreview();
}

function toggleSplitView(): void {
  const wasHidden = els.contentColumnSecondary.hidden;
  els.contentColumnSecondary.hidden = !wasHidden;
  els.splitResizer.hidden = !wasHidden;
  if (wasHidden) refreshSplitView();
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
      void renderMermaidBlocks(els.preview, mermaidSources);
      void markWikiLinks(els.preview);
      els.preview.scrollTop = scrollTop;
      updateStatusChips();
      updateOutline();
      refreshSplitView();
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
    addSnapshot(filePath, text, Date.now());
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
  refreshSplitView();
  if (!els.backlinksPanel.hidden) void refreshBacklinksPanel();
  updateEditUiState();
}

async function closeTab(filePath: string): Promise<void> {
  const tab = findTab(filePath);
  if (!tab) return;
  if (tab.isDirty && !window.confirm(t("edit.confirmDiscard"))) return;

  tab.unwatch?.();
  const idx = tabs.indexOf(tab);
  tabs.splice(idx, 1);
  pushClosedTab(filePath);

  if (activeTabPath !== filePath) {
    renderTabBar();
    refreshSplitView();
    return;
  }

  editHandle?.destroy();
  editHandle = null;
  activeTabPath = null;
  const nextTab = tabs[idx] ?? tabs[idx - 1];
  if (nextTab) await activateTab(nextTab.filePath);
  else showEmptyState();
}

function pushClosedTab(filePath: string): void {
  const existingIndex = closedTabPaths.indexOf(filePath);
  if (existingIndex !== -1) closedTabPaths.splice(existingIndex, 1);
  closedTabPaths.push(filePath);
  if (closedTabPaths.length > MAX_CLOSED_TABS) closedTabPaths.shift();
}

async function reopenLastClosedTab(): Promise<void> {
  const filePath = closedTabPaths.pop();
  if (filePath) await openTabForFile(filePath);
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
  addSnapshot(tab.filePath, text, Date.now());
  renderTabBar();
  updateEditUiState();
  if (!els.gitPanel.hidden) void refreshGitPanel();
  if (!els.backlinksPanel.hidden) void refreshBacklinksPanel();
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
  if (!els.gitPanel.hidden) void refreshGitPanel();
}

// --- Sidebar file management ------------------------------------------

async function createNewFile(dir: string): Promise<void> {
  const name = window.prompt(t("tree.newFilePrompt"));
  if (!name) return;
  const filename = /\.(md|markdown|mdown|mkd)$/i.test(name) ? name : `${name}.md`;
  const filePath = await join(dir, filename);
  if (await exists(filePath)) {
    window.alert(t("tree.errorExists"));
    return;
  }
  try {
    await writeFile(filePath, new Uint8Array());
  } catch (err) {
    window.alert(t("tree.errorGeneric", { error: String(err) }));
    return;
  }
  if (!currentRoot) return;
  await loadFolder(currentRoot, filePath);
  const tab = activeTab();
  if (tab && tab.filePath === filePath && !tab.isEditing) await toggleEditMode();
}

async function createNewFolder(dir: string): Promise<void> {
  const name = window.prompt(t("tree.newFolderPrompt"));
  if (!name) return;
  const folderPath = await join(dir, name);
  if (await exists(folderPath)) {
    window.alert(t("tree.errorExists"));
    return;
  }
  try {
    await mkdir(folderPath);
  } catch (err) {
    window.alert(t("tree.errorGeneric", { error: String(err) }));
    return;
  }
  if (currentRoot) await loadFolder(currentRoot, activeTabPath ?? undefined);
}

async function renameTreeEntry(path: string, isDir: boolean): Promise<void> {
  const oldName = await basename(path);
  const newName = window.prompt(t("tree.renamePrompt"), oldName);
  if (!newName || newName === oldName) return;
  const parentDir = await dirname(path);
  const newPath = await join(parentDir, newName);
  try {
    await rename(path, newPath);
  } catch (err) {
    window.alert(t("tree.errorGeneric", { error: String(err) }));
    return;
  }
  const dirPrefix = path + sep();
  for (const tab of tabs) {
    const isMatch = isDir ? tab.filePath.startsWith(dirPrefix) : tab.filePath === path;
    if (!isMatch) continue;
    const updatedPath = isDir ? newPath + tab.filePath.slice(path.length) : newPath;
    if (activeTabPath === tab.filePath) {
      activeTabPath = updatedPath;
      localStorage.setItem(LAST_FILE_KEY, updatedPath);
    }
    tab.filePath = updatedPath;
    await watchTab(tab);
  }
  if (currentRoot) await loadFolder(currentRoot, activeTabPath ?? undefined);
}

async function deleteTreeEntry(path: string, isDir: boolean): Promise<void> {
  const name = await basename(path);
  const confirmed = window.confirm(t(isDir ? "tree.confirmDeleteFolder" : "tree.confirmDeleteFile", { name }));
  if (!confirmed) return;
  try {
    await remove(path, { recursive: true });
  } catch (err) {
    window.alert(t("tree.errorGeneric", { error: String(err) }));
    return;
  }
  if (currentRoot) await loadFolder(currentRoot, activeTabPath ?? undefined);
}

interface TreeContextTarget {
  path: string;
  isDir: boolean;
  isRoot: boolean;
}

async function showTreeContextMenu(clientX: number, clientY: number, target: TreeContextTarget): Promise<void> {
  closeAllDropdowns();
  const targetDir = target.isDir ? target.path : await dirname(target.path);

  els.treeContextMenu.innerHTML = "";
  const addItem = (labelKey: string, onClick: () => void) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = t(labelKey);
    btn.addEventListener("click", () => {
      els.treeContextMenu.hidden = true;
      onClick();
    });
    els.treeContextMenu.appendChild(btn);
  };

  addItem("tree.newFile", () => void createNewFile(targetDir));
  addItem("tree.newFolder", () => void createNewFolder(targetDir));
  if (!target.isDir) {
    addItem(isFavorite(target.path) ? "tree.unfavorite" : "tree.favorite", () => {
      toggleFavorite(target.path);
      renderFavorites();
    });
  }
  if (!target.isRoot) {
    const sep = document.createElement("div");
    sep.className = "menu-sep";
    els.treeContextMenu.appendChild(sep);
    addItem("tree.rename", () => void renameTreeEntry(target.path, target.isDir));
    addItem("tree.delete", () => void deleteTreeEntry(target.path, target.isDir));
  }

  els.treeContextMenu.style.left = `${clientX}px`;
  els.treeContextMenu.style.top = `${clientY}px`;
  els.treeContextMenu.hidden = false;
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
  refreshSplitView();
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

// --- Updates -------------------------------------------------------------

function showUpdateBanner(message: string, showAction: boolean): void {
  els.updateBannerText.textContent = message;
  els.updateBannerAction.hidden = !showAction;
  els.updateBannerAction.disabled = false;
  els.updateBanner.hidden = false;
}

async function runUpdateCheck(manual: boolean): Promise<void> {
  const result = await checkForUpdate();
  if (result.available) {
    showUpdateBanner(t("updater.available", { version: result.version! }), true);
  } else if (manual) {
    showUpdateBanner(t("updater.upToDate"), false);
  }
}

// --- App rating prompt -----------------------------------------------------

function maybeShowRatingBanner(): void {
  if (!els.updateBanner.hidden) return;
  if (!shouldShowRatingPrompt(Date.now())) return;
  els.ratingBanner.hidden = false;
}

// --- Command palette -----------------------------------------------------

interface PaletteCommand {
  id: string;
  label: string;
  run: () => void;
}

function getCommands(): PaletteCommand[] {
  return [
    { id: "open-file", label: t("menu.openFile"), run: () => void openFile() },
    { id: "open-folder", label: t("menu.openFolder"), run: () => void openFolder() },
    { id: "open-palette", label: t("menu.commandPalette"), run: () => openCommandPalette() },
    { id: "save", label: t("menu.save"), run: () => void saveActiveTab() },
    {
      id: "close-tab",
      label: t("menu.closeTab"),
      run: () => {
        if (activeTabPath) void closeTab(activeTabPath);
      },
    },
    { id: "reopen-closed-tab", label: t("menu.reopenClosedTab"), run: () => void reopenLastClosedTab() },
    { id: "open-history", label: t("menu.history"), run: () => openHistory() },
    {
      id: "toggle-favorite",
      label: activeTab() && isFavorite(activeTab()!.filePath) ? t("tree.unfavorite") : t("tree.favorite"),
      run: () => {
        const tab = activeTab();
        if (!tab) return;
        toggleFavorite(tab.filePath);
        renderFavorites();
      },
    },
    { id: "toggle-edit", label: t("palette.toggleEdit"), run: () => void toggleEditMode() },
    { id: "export-pdf", label: t("export.pdf"), run: () => void exportAs("pdf") },
    { id: "export-docx", label: t("export.docx"), run: () => void exportAs("docx") },
    { id: "export-txt", label: t("export.txt"), run: () => void exportAs("txt") },
    { id: "export-html", label: t("export.html"), run: () => void exportAs("html") },
    { id: "toggle-sidebar", label: t("menu.toggleSidebar"), run: () => els.body.classList.toggle("sidebar-hidden") },
    { id: "toggle-outline", label: t("menu.toggleOutline"), run: () => toggleOutlinePanel() },
    { id: "toggle-git", label: t("menu.toggleGit"), run: () => toggleGitPanel() },
    { id: "toggle-backlinks", label: t("menu.toggleBacklinks"), run: () => toggleBacklinksPanel() },
    { id: "toggle-split", label: t("menu.toggleSplit"), run: () => toggleSplitView() },
    {
      id: "toggle-diff",
      label: t("split.diffToggle"),
      run: () => {
        if (els.contentColumnSecondary.hidden) toggleSplitView();
        setDiffMode(!diffModeActive);
      },
    },
    { id: "toggle-zen", label: t("menu.toggleZen"), run: () => els.app.classList.toggle("zen-mode") },
    {
      id: "search-files",
      label: t("palette.searchFiles"),
      run: () => {
        els.sidebarSearch.hidden = false;
        els.fileTree.hidden = true;
        els.sidebarSearchInput.focus();
        renderSearchResults(els.sidebarSearchInput.value, []);
      },
    },
    {
      id: "theme-dark",
      label: `${t("menu.theme")}: ${t("settings.theme.dark")}`,
      run: () => {
        settings.theme = "dark";
        saveSettings(settings);
        applySettings(settings);
      },
    },
    {
      id: "theme-light",
      label: `${t("menu.theme")}: ${t("settings.theme.light")}`,
      run: () => {
        settings.theme = "light";
        saveSettings(settings);
        applySettings(settings);
      },
    },
    {
      id: "theme-system",
      label: `${t("menu.theme")}: ${t("settings.theme.system")}`,
      run: () => {
        settings.theme = "system";
        saveSettings(settings);
        applySettings(settings);
      },
    },
    { id: "settings", label: t("menu.settings"), run: () => els.settingsBtn.click() },
    { id: "check-update", label: t("menu.checkUpdate"), run: () => void runUpdateCheck(true) },
    { id: "open-repo", label: t("menu.repo"), run: () => void openUrl(REPO_URL) },
  ];
}

let paletteMatches: PaletteCommand[] = [];
let paletteActiveIndex = 0;

function renderPaletteList(query: string): void {
  paletteMatches = fuzzyFilter(query, getCommands(), (cmd) => cmd.label);
  paletteActiveIndex = 0;
  els.commandPaletteList.innerHTML = "";
  if (paletteMatches.length === 0) {
    const empty = document.createElement("div");
    empty.className = "palette-empty";
    empty.textContent = t("palette.noResults");
    els.commandPaletteList.appendChild(empty);
    return;
  }
  paletteMatches.forEach((cmd, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "palette-item" + (index === paletteActiveIndex ? " active" : "");
    const label = document.createElement("span");
    label.textContent = cmd.label;
    btn.appendChild(label);
    const combo = shortcuts[cmd.id];
    if (combo) {
      const hint = document.createElement("span");
      hint.className = "shortcut-hint";
      hint.textContent = formatCombo(combo);
      btn.appendChild(hint);
    }
    btn.addEventListener("click", () => {
      closeCommandPalette();
      cmd.run();
    });
    els.commandPaletteList.appendChild(btn);
  });
}

function shortcutSuffix(id: string): string {
  const combo = shortcuts[id];
  return combo ? ` (${formatCombo(combo)})` : "";
}

function applyShortcutLabels(): void {
  document.querySelectorAll<HTMLElement>("[data-shortcut-for]").forEach((el) => {
    const id = el.dataset.shortcutFor!;
    const hint = el.querySelector<HTMLElement>(".shortcut-hint");
    if (hint) {
      hint.textContent = shortcutSuffix(id).trim();
    } else if (el.dataset.i18nTitle) {
      el.title = t(el.dataset.i18nTitle) + shortcutSuffix(id);
    }
  });
}

function highlightPaletteActive(): void {
  const items = els.commandPaletteList.querySelectorAll<HTMLElement>(".palette-item");
  items.forEach((el, index) => el.classList.toggle("active", index === paletteActiveIndex));
  items[paletteActiveIndex]?.scrollIntoView({ block: "nearest" });
}

function openCommandPalette(): void {
  els.commandPaletteOverlay.hidden = false;
  els.commandPaletteInput.value = "";
  renderPaletteList("");
  els.commandPaletteInput.focus();
}

function closeCommandPalette(): void {
  els.commandPaletteOverlay.hidden = true;
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
    case "reopen-closed-tab":
      void reopenLastClosedTab();
      break;
    case "open-history":
      openHistory();
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
  if (actionBtn.dataset.action === "open-settings") els.settingsBtn.click();
});

function renderWindowMenu(): void {
  const checks: Record<string, boolean> = {
    "toggle-sidebar": !els.body.classList.contains("sidebar-hidden"),
    "toggle-outline": !els.outlinePanel.hidden,
    "toggle-git": !els.gitPanel.hidden,
    "toggle-backlinks": !els.backlinksPanel.hidden,
    "toggle-split": !els.contentColumnSecondary.hidden,
    "toggle-zen": els.app.classList.contains("zen-mode"),
  };
  els.menuWindow.querySelectorAll<HTMLElement>(".menu-toggle").forEach((btn) => {
    const action = btn.dataset.action ?? "";
    btn.classList.toggle("checked", !!checks[action]);
  });
}

setupDropdown(els.menuWindowBtn, els.menuWindow);
els.menuWindowBtn.addEventListener("click", renderWindowMenu);
els.menuWindow.addEventListener("click", (e) => {
  const actionBtn = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!actionBtn) return;
  switch (actionBtn.dataset.action) {
    case "toggle-sidebar":
      els.body.classList.toggle("sidebar-hidden");
      break;
    case "toggle-outline":
      toggleOutlinePanel();
      break;
    case "toggle-git":
      toggleGitPanel();
      break;
    case "toggle-backlinks":
      toggleBacklinksPanel();
      break;
    case "toggle-split":
      toggleSplitView();
      break;
    case "toggle-zen":
      els.app.classList.toggle("zen-mode");
      break;
  }
  renderWindowMenu();
});

setupDropdown(els.menuHelpBtn, els.menuHelp);
els.menuHelp.addEventListener("click", (e) => {
  const actionBtn = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (actionBtn?.dataset.action === "open-repo") void openUrl(REPO_URL);
  else if (actionBtn?.dataset.action === "check-update") void runUpdateCheck(true);
  else if (actionBtn?.dataset.action === "open-palette") openCommandPalette();
});

els.updateBannerDismiss.addEventListener("click", () => {
  els.updateBanner.hidden = true;
});
els.updateBannerAction.addEventListener("click", () => {
  els.updateBannerAction.disabled = true;
  els.updateBannerText.textContent = t("updater.downloading");
  installPendingUpdate((downloaded, total) => {
    if (total > 0) {
      els.updateBannerText.textContent = t("updater.downloadingProgress", {
        percent: String(Math.round((downloaded / total) * 100)),
      });
    }
  }).catch((err) => {
    els.updateBannerText.textContent = t("updater.error", { error: String(err) });
    els.updateBannerAction.disabled = false;
  });
});

els.ratingBannerRate.addEventListener("click", () => {
  dismissRatingPromptForever(Date.now());
  els.ratingBanner.hidden = true;
  void openUrl(REPO_URL);
});
els.ratingBannerLater.addEventListener("click", () => {
  snoozeRatingPrompt(Date.now());
  els.ratingBanner.hidden = true;
});
els.ratingBannerNever.addEventListener("click", () => {
  dismissRatingPromptForever(Date.now());
  els.ratingBanner.hidden = true;
});

window.addEventListener("keydown", (e) => {
  for (const [id, combo] of Object.entries(shortcuts)) {
    if (!combo || !matchesCombo(e, combo)) continue;
    const cmd = getCommands().find((c) => c.id === id);
    if (cmd) {
      e.preventDefault();
      cmd.run();
    }
    return;
  }
});

els.commandPaletteOverlay.addEventListener("click", (e) => {
  if (e.target === els.commandPaletteOverlay) closeCommandPalette();
});
els.historyOverlay.addEventListener("click", (e) => {
  if (e.target === els.historyOverlay) closeHistory();
});
els.historyCloseBtn.addEventListener("click", closeHistory);
els.historyClearBtn.addEventListener("click", () => {
  const tab = activeTab();
  if (!tab) return;
  if (!window.confirm(t("history.confirmClear"))) return;
  clearHistory(tab.filePath);
  renderHistoryList();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !els.historyOverlay.hidden) closeHistory();
});
els.commandPaletteInput.addEventListener("input", () => {
  renderPaletteList(els.commandPaletteInput.value);
});
els.commandPaletteInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    closeCommandPalette();
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    if (paletteMatches.length > 0) {
      paletteActiveIndex = (paletteActiveIndex + 1) % paletteMatches.length;
      highlightPaletteActive();
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (paletteMatches.length > 0) {
      paletteActiveIndex = (paletteActiveIndex - 1 + paletteMatches.length) % paletteMatches.length;
      highlightPaletteActive();
    }
  } else if (e.key === "Enter") {
    e.preventDefault();
    const cmd = paletteMatches[paletteActiveIndex];
    if (cmd) {
      closeCommandPalette();
      cmd.run();
    }
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && els.app.classList.contains("zen-mode")) {
    els.app.classList.remove("zen-mode");
  }
});

initSettingsPanel(settings, {
  onLanguageChange: () => {
    updateEditUiState();
    renderTabBar();
    applyShortcutLabels();
  },
  onShowHiddenChange: () => {
    if (currentRoot) void loadFolder(currentRoot, activeTabPath ?? undefined);
  },
  onAutoReloadChange: () => {
    for (const tab of tabs) void watchTab(tab);
  },
  onShortcutsChange: () => {
    shortcuts = loadShortcuts();
    applyShortcutLabels();
    updateEditUiState();
  },
  getShortcutCommands: () => getCommands().map((cmd) => ({ id: cmd.id, label: cmd.label })),
});

els.sidebarSearchToggle.addEventListener("click", () => {
  const showingSearch = els.sidebarSearch.hidden;
  els.sidebarSearch.hidden = !showingSearch;
  els.fileTree.hidden = showingSearch;
  if (showingSearch) {
    els.sidebarSearchInput.focus();
    renderSearchResults(els.sidebarSearchInput.value, []);
  } else {
    els.sidebarReplaceRow.hidden = true;
  }
});
els.sidebarSearchInput.addEventListener("input", () => {
  const query = els.sidebarSearchInput.value;
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void runSearch(query), SEARCH_DEBOUNCE_MS);
});
els.sidebarReplaceToggle.addEventListener("click", () => {
  els.sidebarReplaceRow.hidden = !els.sidebarReplaceRow.hidden;
  if (!els.sidebarReplaceRow.hidden) els.sidebarReplaceInput.focus();
});
els.sidebarReplaceAllBtn.addEventListener("click", () => void handleReplaceAll());

function handleWikiLinkClick(e: MouseEvent): void {
  const link = (e.target as HTMLElement).closest<HTMLAnchorElement>("a.wiki-link");
  if (!link) return;
  e.preventDefault();
  void openWikiLink(link.dataset.wikiTarget ?? "");
}
els.preview.addEventListener("click", handleWikiLinkClick);
els.editPreview.addEventListener("click", handleWikiLinkClick);
els.previewSecondary.addEventListener("click", handleWikiLinkClick);
els.gitRefreshBtn.addEventListener("click", () => void refreshGitPanel());
els.sidebar.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (!currentRoot) return;
  const row = (e.target as HTMLElement).closest<HTMLElement>(".tree-row");
  const target: TreeContextTarget = row
    ? { path: row.dataset.path!, isDir: row.dataset.isDir === "true", isRoot: false }
    : { path: currentRoot, isDir: true, isRoot: true };
  void showTreeContextMenu(e.clientX, e.clientY, target);
});

applyTranslations();
applyShortcutLabels();
renderFavorites();
setupResizer(document.querySelector<HTMLDivElement>("#resizer")!, document.querySelector<HTMLDivElement>("#sidebar")!);
setupResizer(document.querySelector<HTMLDivElement>("#edit-resizer")!, els.editorColumn);
setupResizer(els.splitResizer, els.contentColumnSecondary, false);
setupVerticalResizer(els.bodyBottomResizer, els.bodyBottom);
setupPanelDrag(els.outlineHeader, els.outlinePanel, t("outline.title"));
setupPanelDrag(els.gitHeader, els.gitPanel, "Git");
setupPanelDrag(els.backlinksHeader, els.backlinksPanel, t("backlinks.title"));
els.splitTabSelect.addEventListener("change", renderSplitPreview);
els.splitCloseBtn.addEventListener("click", toggleSplitView);
els.splitDiffToggle.addEventListener("click", () => setDiffMode(!diffModeActive));
setupDragDrop();
void restoreLastSession();
recordLaunch(Date.now());
setTimeout(() => void runUpdateCheck(false).then(() => maybeShowRatingBanner()), UPDATE_CHECK_DELAY_MS);
