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
    selectedText: selectedDomText(domSelection, range) || sourceTextForRange(lines, lineStart, lineEnd),
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

function selectedDomText(selection: Selection, range: Range): string {
  const fragment = range.cloneContents()
  const ignored = fragment.querySelectorAll("[data-selection-ignore]")
  if (ignored.length === 0) return cleanSelection(selection.toString())
  ignored.forEach((element) => element.remove())

  const host = document.createElement("div")
  host.setAttribute("aria-hidden", "true")
  host.style.cssText = "position:fixed;left:-100000px;top:0;width:1000px;opacity:0;pointer-events:none"
  host.append(fragment)
  document.body.append(host)
  const value = typeof host.innerText === "string" ? host.innerText : host.textContent ?? ""
  host.remove()
  return cleanSelection(value)
}

function cleanSelection(value: string): string {
  return value.trim()
}
