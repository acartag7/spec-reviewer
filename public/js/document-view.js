import { overlappingOpenAnnotations } from "./annotations.js";

export function renderDocument(container, state, onSelect) {
  container.textContent = "";
  if (state.document == null) return;

  for (const line of state.document.lines) {
    const row = document.createElement("div");
    row.className = lineClass(line, state);
    row.dataset.line = String(line.number);
    row.tabIndex = 0;
    row.addEventListener("click", () => onSelect({
      lineStart: line.number,
      lineEnd: line.number,
      selectedText: line.text,
    }));

    const no = document.createElement("div");
    no.className = "line-no";
    no.dataset.lineNumber = String(line.number);

    const text = document.createElement("div");
    text.className = "line-text";
    text.textContent = line.text;

    row.append(no, text);
    container.append(row);
  }

  bindTextSelection(container, state.document.lines, onSelect);
}

export function scrollToLine(line) {
  document.querySelector(`[data-line="${line}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
}

function lineClass(line, state) {
  const classes = ["line", `kind-${line.kind}`];
  const selection = state.selection;
  if (selection.lineStart <= line.number && selection.lineEnd >= line.number) classes.push("selected");
  if (overlappingOpenAnnotations(state.review.annotations, line.number).length > 0) classes.push("has-note");
  return classes.join(" ");
}

function bindTextSelection(container, lines, onSelect) {
  container.onmouseup = () => {
    const selection = window.getSelection();
    if (selection == null || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;
    const start = lineFromNode(range.startContainer);
    const end = lineFromNode(range.endContainer);
    if (start == null || end == null) return;
    onSelect({
      lineStart: Math.min(start, end),
      lineEnd: Math.max(start, end),
      selectedText: selectedTextFromLines(lines, Math.min(start, end), Math.max(start, end), selection.toString()),
    });
  };
}

function selectedTextFromLines(lines, start, end, rawSelection) {
  if (start === end) return cleanSelection(rawSelection);
  return lines
    .filter((line) => line.number >= start && line.number <= end)
    .map((line) => line.text)
    .join("\n")
    .trim();
}

function cleanSelection(value) {
  return value
    .split(/\n/)
    .map((line) => line.replace(/^\s*\d+\s+/, ""))
    .join("\n")
    .trim();
}

function lineFromNode(node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  const row = element?.closest?.("[data-line]");
  return row == null ? null : Number(row.dataset.line);
}
