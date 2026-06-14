import { useRef } from "react"
import type { Review, ReviewDocument, SelectionRange } from "@/api/types"
import { SourceStateBanner } from "@/components/SourceState"
import { overlappingOpenAnnotations } from "@/lib/review-utils"
import type { ReviewSourceState } from "@/api/types"
import { cn } from "@/lib/utils"

interface ReaderPaneProps {
  document: ReviewDocument
  review: Review
  selection: SelectionRange
  sourceState: ReviewSourceState
  onSelect: (selection: SelectionRange) => void
}

export function ReaderPane({ document, review, selection, sourceState, onSelect }: ReaderPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const openCount = review.annotations.filter((item) => item.status === "open").length

  return (
    <section className="review-scroll min-h-0 overflow-auto p-5 lg:p-7">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate font-heading text-2xl font-semibold tracking-normal">{document.title}</h1>
          <div className="truncate font-mono text-xs text-muted-foreground">{document.path}</div>
        </div>
        <div className="whitespace-pre-line text-right font-mono text-xs text-muted-foreground">
          {document.lines.length} lines{"\n"}{openCount} open notes
        </div>
      </div>
      <div className="mb-3">
        <SourceStateBanner state={sourceState} />
      </div>
      <div
        ref={containerRef}
        className="overflow-hidden rounded-lg border bg-card"
        onMouseUp={() => {
          const next = selectionFromWindow(containerRef.current, document.lines)
          if (next != null) onSelect(next)
        }}
      >
        {document.lines.map((line) => {
          const selected = selection.lineStart <= line.number && selection.lineEnd >= line.number
          const hasNote = overlappingOpenAnnotations(review.annotations, line.number).length > 0
          return (
            <div
              key={line.number}
              data-line={line.number}
              tabIndex={0}
              className={cn(
                "source-line min-h-7 border-b last:border-b-0 hover:bg-muted",
                `kind-${line.kind}`,
                selected && "bg-accent",
                hasNote && "shadow-[inset_3px_0_0_var(--sev-major)]",
              )}
              onClick={() => onSelect({ lineStart: line.number, lineEnd: line.number, selectedText: line.text })}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onSelect({ lineStart: line.number, lineEnd: line.number, selectedText: line.text })
                }
              }}
            >
              <div
                className="source-line-no bg-muted px-2 py-1.5 text-right font-mono text-xs text-muted-foreground/60"
                data-line-number={line.number}
              />
              <div className="source-line-text px-3 py-1.5 font-mono text-[13px] leading-6">{line.text}</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function selectionFromWindow(
  container: HTMLDivElement | null,
  lines: ReviewDocument["lines"],
): SelectionRange | null {
  if (container == null) return null
  const domSelection = window.getSelection()
  if (domSelection == null || domSelection.isCollapsed) return null
  const range = domSelection.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) return null
  const start = lineFromNode(range.startContainer)
  const end = lineFromNode(range.endContainer)
  if (start == null || end == null) return null
  const lineStart = Math.min(start, end)
  const lineEnd = Math.max(start, end)
  return {
    lineStart,
    lineEnd,
    selectedText: selectedTextFromLines(lines, lineStart, lineEnd, domSelection.toString()),
  }
}

function selectedTextFromLines(
  lines: ReviewDocument["lines"],
  start: number,
  end: number,
  rawSelection: string,
): string {
  if (start === end) return cleanSelection(rawSelection)
  return lines
    .filter((line) => line.number >= start && line.number <= end)
    .map((line) => line.text)
    .join("\n")
    .trim()
}

function cleanSelection(value: string): string {
  return value
    .split(/\n/)
    .map((line) => line.replace(/^\s*\d+\s+/, ""))
    .join("\n")
    .trim()
}

function lineFromNode(node: Node): number | null {
  const element = node instanceof Element ? node : node.parentElement
  const row = element?.closest("[data-line]")
  const value = row instanceof HTMLElement ? row.dataset.line : null
  return value == null ? null : Number(value)
}
