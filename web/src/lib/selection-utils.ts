import type { ReviewDocument, SelectionRange } from "@/api/types"
import { sourceTextForRange } from "@/lib/markdown-provenance"

interface SourceRange {
  lineStart: number
  lineEnd: number
}

export function selectionFromWindow(
  container: HTMLElement | null,
  lines: ReviewDocument["lines"],
): SelectionRange | null {
  if (container == null) return null
  const domSelection = window.getSelection()
  if (domSelection == null || domSelection.isCollapsed) return null
  const range = domSelection.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) return null
  const start = rangeFromNode(range.startContainer)
  const end = rangeFromNode(range.endContainer)
  if (start == null || end == null) return null
  const lineStart = Math.min(start.lineStart, end.lineStart)
  const lineEnd = Math.max(start.lineEnd, end.lineEnd)
  return {
    lineStart,
    lineEnd,
    selectedText: cleanSelection(domSelection.toString()) || sourceTextForRange(lines, lineStart, lineEnd),
  }
}

export function selectionFromElement(target: EventTarget | null, lines: ReviewDocument["lines"]): SelectionRange | null {
  const element = target instanceof Element ? target : null
  const range = element == null ? null : rangeFromElement(element)
  if (range == null) return null
  return {
    ...range,
    selectedText: sourceTextForRange(lines, range.lineStart, range.lineEnd),
  }
}

function rangeFromNode(node: Node): SourceRange | null {
  const element = node instanceof Element ? node : node.parentElement
  return element == null ? null : rangeFromElement(element)
}

function rangeFromElement(element: Element): SourceRange | null {
  const row = element.closest("[data-source-line]")
  if (!(row instanceof HTMLElement)) return null
  const start = Number(row.dataset.sourceLine)
  const end = Number(row.dataset.sourceEndLine ?? row.dataset.sourceLine)
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null
  return { lineStart: start, lineEnd: end }
}

function cleanSelection(value: string): string {
  return value
    .split(/\n/)
    .map((line) => line.replace(/^\s*\d+\s+/, ""))
    .join("\n")
    .trim()
}
