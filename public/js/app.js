import { api } from "./api.js";
import { createAnnotation, removeAnnotation, upsertAnnotation } from "./annotations.js";
import { renderDocument, scrollToLine } from "./document-view.js";
import { bindSelectedTextAutosize, bindSegmentedControls, fillForm, readForm, renderAnnotationList, updateSelectionFields } from "./review-panel.js";
import { bindStartScreen, renderRecentReviews } from "./start-screen.js";

const state = {
  path: "",
  document: null,
  review: { summary: "", annotations: [] },
  selection: { lineStart: 1, lineEnd: 1, selectedText: "" },
  sourceState: "unreviewed",
};

const el = {
  openForm: document.querySelector("#open-form"),
  pathInput: document.querySelector("#path-input"),
  startScreen: document.querySelector("#start-screen"),
  workspace: document.querySelector(".workspace"),
  startPathForm: document.querySelector("#start-path-form"),
  startPathInput: document.querySelector("#start-path-input"),
  dropZone: document.querySelector("#drop-zone"),
  fileInput: document.querySelector("#file-input"),
  recentList: document.querySelector("#recent-list"),
  exportButton: document.querySelector("#export-button"),
  docTitle: document.querySelector("#doc-title"),
  docMeta: document.querySelector("#doc-meta"),
  counts: document.querySelector("#counts"),
  stateBanner: document.querySelector("#state-banner"),
  lines: document.querySelector("#document-lines"),
  list: document.querySelector("#annotation-list"),
  exportOutput: document.querySelector("#export-output"),
  copyExport: document.querySelector("#copy-export"),
  status: document.querySelector("#status"),
};

const form = {
  form: document.querySelector("#annotation-form"),
  editingId: hiddenInput("editing-id"),
  createdAt: hiddenInput("created-at"),
  lineStart: document.querySelector("#line-start"),
  lineEnd: document.querySelector("#line-end"),
  selectedText: document.querySelector("#selected-text"),
  severity: document.querySelector("#severity"),
  kind: document.querySelector("#kind"),
  note: document.querySelector("#note"),
};
form.form.append(form.editingId, form.createdAt);

boot().catch(showError);

async function boot() {
  bindEvents();
  const config = await api.config();
  const urlPath = new URLSearchParams(location.search).get("path");
  const path = urlPath || config.defaultDocumentPath;
  if (path) await openPath(path);
  else await showStart();
}

function bindEvents() {
  el.openForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await openPath(el.pathInput.value.trim()).catch(showError);
  });
  form.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await addOrUpdateAnnotation().catch(showError);
  });
  document.querySelector("#reset-form").addEventListener("click", () => fillForm(form, null, state.selection));
  el.exportButton.addEventListener("click", () => copyExport().catch(showError));
  el.copyExport.addEventListener("click", () => copyExport().catch(showError));
  bindSegmentedControls(form.form, form);
  bindSelectedTextAutosize(form);
  bindStartScreen(el, {
    openPath: (path) => openPath(path).catch(showError),
    openFile: (file) => openFile(file).catch(showError),
  });
}

async function openPath(path) {
  if (!path) throw new Error("Enter a Markdown path");
  const result = await api.openDocument(path);
  applyOpenResult(result);
  showStatus(result.stale ? "Loaded with stale annotations" : "Loaded");
}

async function openFile(file) {
  if (!isMarkdownFile(file.name)) throw new Error("Drop a .md or .markdown file");
  const result = await api.uploadDocument({ name: file.name, content: await file.text() });
  applyOpenResult(result);
  showStatus("Dropped file loaded");
}

function applyOpenResult(result) {
  state.path = result.document.path;
  state.document = result.document;
  state.review = result.review;
  state.selection = { lineStart: 1, lineEnd: 1, selectedText: "" };
  state.sourceState = result.sourceState ?? (result.stale ? "changed" : "current");
  el.pathInput.value = state.path;
  el.startPathInput.value = state.path;
  history.replaceState(null, "", `/?path=${encodeURIComponent(state.path)}`);
  fillForm(form, null, state.selection);
  el.startScreen.hidden = true;
  el.workspace.hidden = false;
  render();
}

async function addOrUpdateAnnotation() {
  if (state.document == null) throw new Error("Open a document first");
  const annotation = createAnnotation(state.selection, readForm(form));
  if (!annotation.note) throw new Error("Feedback is required");
  upsertAnnotation(state.review, annotation);
  fillForm(form, null, state.selection);
  render();
  await saveReview();
}

async function saveReview() {
  if (state.document == null) throw new Error("Open a document first");
  state.review = await api.saveReview({
    path: state.path,
    summary: state.review.summary,
    annotations: state.review.annotations,
  });
  if (state.sourceState !== "changed") state.sourceState = "current";
  render();
  refreshRecent().catch(() => undefined);
  showStatus("Saved");
}

async function exportReview() {
  if (state.document == null) throw new Error("Open a document first");
  await saveReview();
  const result = await api.exportReview(state.path);
  el.exportOutput.value = result.markdown;
  showStatus("Export ready");
}

async function copyExport() {
  if (!el.exportOutput.value) await exportReview();
  try {
    await navigator.clipboard.writeText(el.exportOutput.value);
    showStatus("Feedback copied");
  } catch {
    showStatus("Feedback ready below");
  }
}

function render() {
  const openCount = state.review.annotations.filter((item) => item.status === "open").length;
  el.docTitle.textContent = state.document?.title ?? "No document open";
  el.docMeta.textContent = state.document == null ? "Open a Markdown file to start." : state.path;
  el.counts.textContent = state.document == null ? "" : `${state.document.lines.length} lines\n${openCount} open notes`;
  renderSourceState();
  renderDocument(el.lines, state, (selection) => {
    state.selection = selection;
    updateSelectionFields(form, state.selection);
    render();
  });
  renderAnnotationList(el.list, state.review.annotations, {
    open: (annotation) => scrollToLine(annotation.lineStart),
    edit: (annotation) => fillForm(form, annotation, state.selection),
    delete: async (annotation) => {
      removeAnnotation(state.review, annotation.id);
      render();
      await saveReview();
    },
  });
}

async function showStart() {
  state.document = null;
  state.sourceState = "unreviewed";
  el.workspace.hidden = true;
  el.startScreen.hidden = false;
  await refreshRecent();
}

async function refreshRecent() {
  renderRecentReviews(el.recentList, await api.recentReviews(), (path) => openPath(path).catch(showError));
}

function isMarkdownFile(name) {
  const lower = name.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

function renderSourceState() {
  const message = sourceStateMessage();
  el.stateBanner.hidden = message == null;
  el.stateBanner.textContent = message ?? "";
}

function sourceStateMessage() {
  if (state.sourceState === "changed") {
    return "This file changed since these notes were saved. Recheck line anchors before sending feedback.";
  }
  if (state.sourceState === "unreviewed") return "No saved review yet. Notes will start tracking this file version.";
  return null;
}

function hiddenInput(id) {
  const input = document.createElement("input");
  input.type = "hidden";
  input.id = id;
  return input;
}

function showStatus(message) {
  el.status.textContent = message;
  el.status.classList.add("show");
  setTimeout(() => el.status.classList.remove("show"), 1800);
}

function showError(error) {
  showStatus(error instanceof Error ? error.message : String(error));
}
