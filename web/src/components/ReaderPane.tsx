import { useEffect, useState } from "react"
import type { Review, ReviewComparison, ReviewDocument, ReviewSourceState, SelectionRange } from "@/api/types"
import { ChangesView, changesTabLabel } from "@/components/ChangesView"
import { RenderedMarkdown } from "@/components/RenderedMarkdown"
import { SourceStateBanner } from "@/components/SourceState"
import { SourceReader } from "@/components/SourceReader"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface ReaderPaneProps {
  document: ReviewDocument
  review: Review
  selection: SelectionRange
  sourceState: ReviewSourceState
  comparison: ReviewComparison
  onSelect: (selection: SelectionRange) => void
}

type ReaderView = "rendered" | "source" | "changes"

export function ReaderPane({ document, review, selection, sourceState, comparison, onSelect }: ReaderPaneProps) {
  const [view, setView] = useState<ReaderView>(() => defaultView(comparison))
  const openCount = review.annotations.filter((item) => item.status === "open").length
  const comparisonKey = comparison.state === "diff"
    ? comparison.roundId
    : comparison.state === "unavailable" ? `${comparison.state}:${comparison.reason}` : comparison.state
  useEffect(() => setView(defaultView(comparison)), [document.path, comparisonKey])

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
        <SourceStateBanner state={sourceState} annotations={review.annotations} />
      </div>
      <Tabs value={view} onValueChange={(value) => setView(value as ReaderView)}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <TabsList aria-label="Reader view">
            <TabsTrigger value="rendered" onClick={() => setView("rendered")}>Rendered</TabsTrigger>
            <TabsTrigger value="source" onClick={() => setView("source")}>Source</TabsTrigger>
            <TabsTrigger value="changes" onClick={() => setView("changes")} aria-label={changesTabLabel(comparison)}>Changes</TabsTrigger>
          </TabsList>
          {view !== "changes" && selection.lineStart > 0 && <div className="font-mono text-xs text-muted-foreground">
            L{selection.lineStart}{selection.lineEnd !== selection.lineStart ? `-L${selection.lineEnd}` : ""}
          </div>}
        </div>
        <TabsContent value="rendered">
          <RenderedMarkdown
            document={document}
            review={review}
            comparison={comparison}
            selection={selection}
            onSelect={onSelect}
          />
        </TabsContent>
        <TabsContent value="source">
          <SourceReader document={document} review={review} selection={selection} onSelect={onSelect} />
        </TabsContent>
        <TabsContent value="changes">
          <ChangesView comparison={comparison} document={document} selection={selection} onSelect={onSelect} />
        </TabsContent>
      </Tabs>
    </section>
  )
}

function defaultView(comparison: ReviewComparison): ReaderView {
  return comparison.state === "diff" ? "changes" : "rendered"
}
