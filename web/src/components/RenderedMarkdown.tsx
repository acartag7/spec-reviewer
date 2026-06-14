import { useMemo, useRef } from "react"
import type { Review, ReviewDocument, SelectionRange } from "@/api/types"
import { ArtifactPreview } from "@/components/ArtifactPreview"
import { buildMarkdownBlocks, sourceFromLines, sourceTextForRange } from "@/lib/markdown-provenance"
import { renderMarkdownBlockHtml } from "@/lib/markdown-html"
import { selectionFromElement, selectionFromWindow } from "@/lib/selection-utils"
import { cn } from "@/lib/utils"

interface RenderedMarkdownProps {
  document: ReviewDocument
  review: Review
  selection: SelectionRange
  onSelect: (selection: SelectionRange) => void
}

export function RenderedMarkdown({ document, review, selection, onSelect }: RenderedMarkdownProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const suppressClickRef = useRef(false)
  const blocks = useMemo(() => {
    const source = sourceFromLines(document.lines)
    return buildMarkdownBlocks(source).map((block) => ({
      ...block,
      rendered: renderMarkdownBlockHtml(block),
    }))
  }, [document.digest, document.lines])

  return (
    <div
      ref={containerRef}
      className="markdown-body"
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
      {blocks.map((block) => {
        const hit = review.annotations.find((annotation) => {
          return annotation.status === "open" && annotation.lineStart <= block.endLine && annotation.lineEnd >= block.startLine
        })
        const selected = selection.lineStart <= block.endLine && selection.lineEnd >= block.startLine
        return (
          <div
            key={block.id}
            data-line={block.startLine}
            data-source-line={block.startLine}
            data-source-end-line={block.endLine}
            data-severity={hit?.severity}
            tabIndex={0}
            className={cn("markdown-block", selected && "selected")}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onSelect({
                  lineStart: block.startLine,
                  lineEnd: block.endLine,
                  selectedText: sourceTextForRange(document.lines, block.startLine, block.endLine),
                })
              }
            }}
          >
            {block.rendered.artifact == null ? (
              <div dangerouslySetInnerHTML={{ __html: block.rendered.html }} />
            ) : (
              <ArtifactPreview artifact={block.rendered.artifact} />
            )}
          </div>
        )
      })}
    </div>
  )
}
