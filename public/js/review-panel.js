import { sortAnnotations } from "./annotations.js";

export function fillForm(elements, annotation, selection) {
  elements.editingId.value = annotation?.id ?? "";
  elements.createdAt.value = annotation?.createdAt ?? "";
  elements.lineStart.value = annotation?.lineStart ?? selection.lineStart;
  elements.lineEnd.value = annotation?.lineEnd ?? selection.lineEnd;
  elements.selectedText.value = annotation?.selectedText ?? selection.selectedText ?? "";
  elements.severity.value = annotation?.severity ?? "major";
  elements.kind.value = annotation?.kind ?? "issue";
  elements.note.value = annotation?.note ?? "";
  updateSegmented(elements);
  autoSizeSelectedText(elements);
  elements.form.querySelector("button[type=submit]").textContent = annotation == null ? "Add note" : "Update note";
}

export function updateSelectionFields(elements, selection) {
  elements.lineStart.value = selection.lineStart;
  elements.lineEnd.value = selection.lineEnd;
  elements.selectedText.value = selection.selectedText ?? "";
  autoSizeSelectedText(elements);
}

export function readForm(elements) {
  return {
    id: elements.editingId.value,
    createdAt: elements.createdAt.value,
    lineStart: elements.lineStart.value,
    lineEnd: elements.lineEnd.value,
    selectedText: elements.selectedText.value,
    severity: elements.severity.value,
    kind: elements.kind.value,
    note: elements.note.value,
  };
}

export function bindSegmentedControls(root, elements) {
  for (const group of root.querySelectorAll("[data-field]")) {
    group.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-value]");
      if (button == null) return;
      const field = group.dataset.field;
      elements[field].value = button.dataset.value;
      updateSegmented(elements);
    });
  }
  updateSegmented(elements);
}

export function bindSelectedTextAutosize(elements) {
  elements.selectedText.addEventListener("input", () => autoSizeSelectedText(elements));
  autoSizeSelectedText(elements);
}

export function renderAnnotationList(container, annotations, handlers) {
  container.textContent = "";
  const sorted = sortAnnotations(annotations);
  if (sorted.length === 0) {
    container.append(emptyMessage());
    return;
  }
  for (const annotation of sorted) {
    container.append(renderAnnotation(annotation, handlers));
  }
}

function renderAnnotation(annotation, handlers) {
  const item = document.createElement("article");
  item.className = "note";
  const range = annotation.lineStart === annotation.lineEnd
    ? `L${annotation.lineStart}`
    : `L${annotation.lineStart}-${annotation.lineEnd}`;
  const head = document.createElement("div");
  head.className = "note-head";
  head.append(pill(annotation.severity, annotation.severity), pill(annotation.kind), pill(range));
  const text = document.createElement("div");
  text.className = "note-text";
  text.textContent = annotation.note;
  const actions = document.createElement("div");
  actions.className = "note-actions";
  actions.append(button("Edit", () => handlers.edit(annotation)));
  actions.append(button("Delete", () => handlers.delete(annotation)));
  item.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    handlers.open(annotation);
  });
  item.append(head, text, actions);
  return item;
}

function pill(label, tone = "") {
  const element = document.createElement("span");
  element.className = tone === "" ? "pill" : `pill ${tone}`;
  element.textContent = label;
  return element;
}

function button(label, onClick) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
}

function emptyMessage() {
  const element = document.createElement("div");
  element.className = "meta";
  element.textContent = "No annotations yet.";
  return element;
}

function updateSegmented(elements) {
  for (const field of ["severity", "kind"]) {
    const group = elements.form.querySelector(`[data-field="${field}"]`);
    for (const button of group.querySelectorAll("button[data-value]")) {
      button.classList.toggle("active", button.dataset.value === elements[field].value);
    }
  }
}

function autoSizeSelectedText(elements) {
  const textarea = elements.selectedText;
  textarea.style.height = "auto";
  const max = 180;
  const next = Math.min(textarea.scrollHeight, max);
  textarea.style.height = `${next}px`;
  textarea.style.overflowY = textarea.scrollHeight > max ? "auto" : "hidden";
}
