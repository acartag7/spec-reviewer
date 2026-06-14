import { useRef } from "react"
import { MessageSquarePlus } from "lucide-react"
import type { Review, ReviewDocument, SelectionRange } from "@/api/types"
import { overlappingOpenAnnotations } from "@/lib/review-utils"
import { selectionFromElement, selectionFromWindow } from "@/lib/selection-utils"
import { cn } from "@/lib/utils"

interface SourceReaderProps {
  document: ReviewDocument
  review: Review
  selection: SelectionRange
  onSelect: (selection: SelectionRange) => void
}

export function SourceReader({ document, review, selection, onSelect }: SourceReaderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const suppressClickRef = useRef(false)

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-lg border bg-card"
      onMouseUp={() => {
        const next = selectionFromWindow(containerRef.current, document.lines)
        if (next == null) return
        suppressClickRef.current = true
        onSelect(next)
      }}
      onClick={(event) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false
          return
        }
        const next = selectionFromElement(event.target, document.lines)
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
            data-source-line={line.number}
            data-source-end-line={line.number}
            tabIndex={0}
            className={cn(
              "source-line min-h-7 border-b last:border-b-0 hover:bg-muted",
              `kind-${line.kind}`,
              selected && "bg-accent",
              hasNote && "shadow-[inset_3px_0_0_var(--sev-major)]",
            )}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onSelect({ lineStart: line.number, lineEnd: line.number, selectedText: line.text })
              }
            }}
          >
            <button
              type="button"
              className="source-note-button"
              aria-label={`Add note at line ${line.number}`}
              onClick={(event) => {
                event.stopPropagation()
                onSelect({ lineStart: line.number, lineEnd: line.number, selectedText: line.text })
              }}
            >
              <MessageSquarePlus className="size-4" />
            </button>
            <div
              className="source-line-no bg-muted px-2 py-1.5 text-right font-mono text-xs text-muted-foreground/60"
              data-line-number={line.number}
            />
            <div className="source-line-text px-3 py-1.5 font-mono text-[13px] leading-6">{line.text}</div>
          </div>
        )
      })}
    </div>
  )
}
