import { useState } from "react"
import type { Review, ReviewDocument, ReviewSourceState, SelectionRange } from "@/api/types"
import { RenderedMarkdown } from "@/components/RenderedMarkdown"
import { SourceStateBanner } from "@/components/SourceState"
import { SourceReader } from "@/components/SourceReader"
import { cn } from "@/lib/utils"

interface ReaderPaneProps {
  document: ReviewDocument
  review: Review
  selection: SelectionRange
  sourceState: ReviewSourceState
  onSelect: (selection: SelectionRange) => void
}

type ReaderView = "rendered" | "source"

export function ReaderPane({ document, review, selection, sourceState, onSelect }: ReaderPaneProps) {
  const [view, setView] = useState<ReaderView>("rendered")
  const openCount = review.annotations.filter((item) => item.status === "open").length

  return (
    <section className="flex min-h-0 flex-col overflow-hidden bg-card">
      <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b px-3">
        <div role="tablist" aria-label="Reader view" className="inline-flex items-center gap-0.5">
          <ViewButton value="rendered" current={view} onClick={setView}>Rendered</ViewButton>
          <ViewButton value="source" current={view} onClick={setView}>Source</ViewButton>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
          <span>{document.lines.length} lines</span>
          <span aria-hidden="true">·</span>
          <span>{openCount} open</span>
          <span aria-hidden="true">·</span>
          <span>L{selection.lineStart}{selection.lineEnd !== selection.lineStart ? `-L${selection.lineEnd}` : ""}</span>
        </div>
      </div>
      <div className="review-scroll min-h-0 flex-1 overflow-auto overscroll-contain">
        <div className="reader-alert mx-auto max-w-[56rem] px-[clamp(1.25rem,5vw,4rem)] pt-4">
          <SourceStateBanner state={sourceState} annotations={review.annotations} />
        </div>
        <div className="reader-document mx-auto max-w-[56rem] px-[clamp(1.25rem,5vw,4rem)] pb-[clamp(5rem,14vh,8rem)] pt-8">
          {view === "rendered" ? (
            <RenderedMarkdown document={document} review={review} selection={selection} onSelect={onSelect} />
          ) : (
            <SourceReader document={document} review={review} selection={selection} onSelect={onSelect} />
          )}
        </div>
      </div>
    </section>
  )
}

function ViewButton({
  value,
  current,
  onClick,
  children,
}: {
  value: ReaderView
  current: ReaderView
  onClick: (view: ReaderView) => void
  children: string
}) {
  const active = value === current
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        "h-6 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-muted/70 hover:text-foreground",
        active && "bg-muted text-foreground",
      )}
      onClick={() => onClick(value)}
    >
      {children}
    </button>
  )
}
