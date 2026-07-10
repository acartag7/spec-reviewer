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
    <section className="review-scroll min-h-0 overflow-auto px-4 py-5 sm:px-6 lg:px-10 lg:py-7">
      <div className="mx-auto mb-5 flex max-w-4xl items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate font-heading text-2xl font-semibold tracking-tight">{document.title}</h1>
          <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{document.path}</div>
        </div>
        <div className="whitespace-pre-line text-right font-mono text-xs text-muted-foreground">
          {document.lines.length} lines{"\n"}{openCount} open notes
        </div>
      </div>
      <div className="mx-auto mb-3 max-w-4xl">
        <SourceStateBanner state={sourceState} annotations={review.annotations} />
      </div>
      <div className="mx-auto mb-3 flex max-w-4xl items-center justify-between gap-3">
        <div role="tablist" aria-label="Reader view" className="inline-flex rounded-lg bg-muted p-[3px]">
          <ViewButton value="rendered" current={view} onClick={setView}>Rendered</ViewButton>
          <ViewButton value="source" current={view} onClick={setView}>Source</ViewButton>
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          L{selection.lineStart}{selection.lineEnd !== selection.lineStart ? `-L${selection.lineEnd}` : ""}
        </div>
      </div>
      <div className="document-paper mx-auto max-w-4xl rounded-2xl border bg-card px-5 py-7 shadow-sm sm:px-8 lg:px-12 lg:py-10">
        {view === "rendered" ? (
          <RenderedMarkdown document={document} review={review} selection={selection} onSelect={onSelect} />
        ) : (
          <SourceReader document={document} review={review} selection={selection} onSelect={onSelect} />
        )}
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
        "h-7 rounded-md px-2 text-sm font-medium text-muted-foreground",
        active && "bg-background text-foreground shadow-sm",
      )}
      onClick={() => onClick(value)}
    >
      {children}
    </button>
  )
}
