import type { ReviewDocument, SelectionRange } from "@/api/types"
import { sourceTextForRange } from "@/lib/markdown-provenance"

interface SourceRange {
  lineStart: number
  lineEnd: number
}

export const NO_SELECTION: SelectionRange = { lineStart: 0, lineEnd: 0, selectedText: "" }

export function selectionFromWindow(
  container: HTMLElement | null,
  lines: ReviewDocument["lines"],
): SelectionRange | null {
  if (container == null) return null
  const domSelection = window.getSelection()
  if (domSelection == null || domSelection.isCollapsed) return null
  const range = domSelection.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) return null
  const start = rangeFromNode(range.startContainer, lines.length)
  const end = rangeFromNode(range.endContainer, lines.length)
  if (start == null || end == null) return null
  const lineStart = Math.min(start.lineStart, end.lineStart)
  const lineEnd = Math.max(start.lineEnd, end.lineEnd)
  return {
    lineStart,
    lineEnd,
    selectedText: sourceTextForRange(lines, lineStart, lineEnd),
  }
}

export function selectionFromElement(target: EventTarget | null, lines: ReviewDocument["lines"]): SelectionRange | null {
  const element = target instanceof Element ? target : null
  const range = element == null ? null : rangeFromElement(element, lines.length)
  if (range == null) return null
  return {
    ...range,
    selectedText: sourceTextForRange(lines, range.lineStart, range.lineEnd),
  }
}

function rangeFromNode(node: Node, maxLine: number): SourceRange | null {
  const element = node instanceof Element ? node : node.parentElement
  return element == null ? null : rangeFromElement(element, maxLine)
}

function rangeFromElement(element: Element, maxLine: number): SourceRange | null {
  const row = element.closest("[data-source-line]")
  if (!(row instanceof HTMLElement)) return null
  const start = Number(row.dataset.sourceLine)
  const end = Number(row.dataset.sourceEndLine ?? row.dataset.sourceLine)
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > maxLine) return null
  return { lineStart: start, lineEnd: end }
}
