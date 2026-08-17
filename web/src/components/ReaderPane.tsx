import { useEffect, useRef, useState } from "react"
import type { Review, ReviewComparison, ReviewDocument, ReviewSourceState, SelectionRange } from "@/api/types"
import { ChangesView, changesTabLabel } from "@/components/ChangesView"
import { RenderedMarkdown } from "@/components/RenderedMarkdown"
import { SourceStateBanner } from "@/components/SourceState"
import { SourceReader } from "@/components/SourceReader"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { scrollToLine } from "@/lib/scroll-to-line"

interface ReaderPaneProps {
  document: ReviewDocument
  review: Review
  selection: SelectionRange
  sourceState: ReviewSourceState
  comparison: ReviewComparison
  openRequest?: { documentPath: string; line: number } | null
  onSelect: (selection: SelectionRange) => void
}

type ReaderView = "rendered" | "source" | "changes"

export function ReaderPane({ document, review, selection, sourceState, comparison, openRequest, onSelect }: ReaderPaneProps) {
  const noteView = document.format === "source" ? "source" : "rendered"
  const [view, setView] = useState<ReaderView>(() => defaultView(document, comparison))
  const handledOpenRequest = useRef<ReaderPaneProps["openRequest"]>(null)
  const openCount = review.annotations.filter((item) => item.status === "open").length
  const comparisonKey = comparison.state === "diff"
    ? comparison.roundId
    : comparison.state === "unavailable" ? `${comparison.state}:${comparison.reason}` : comparison.state
  useEffect(() => setView(defaultView(document, comparison)), [document.path, document.format, comparisonKey])
  useEffect(() => {
    if (openRequest == null || openRequest.documentPath !== document.path || handledOpenRequest.current === openRequest) return
    if (view !== noteView) {
      setView(noteView)
      return
    }
    const frame = window.requestAnimationFrame(() => {
      scrollToLine(openRequest.line)
      handledOpenRequest.current = openRequest
    })
    return () => window.cancelAnimationFrame(frame)
  }, [document.path, noteView, openRequest, view])

  return (
    <section className="flex min-h-0 flex-col overflow-hidden bg-card">
      <Tabs value={view} onValueChange={(value) => setView(value as ReaderView)} className="min-h-0 gap-0 overflow-hidden">
        <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b px-3">
          <TabsList variant="line" aria-label="Reader view" className="h-8">
            {document.format === "source" ? null : (
              <TabsTrigger value="rendered" onClick={() => setView("rendered")}>Rendered</TabsTrigger>
            )}
            <TabsTrigger value="source" onClick={() => setView("source")}>Source</TabsTrigger>
            <TabsTrigger value="changes" onClick={() => setView("changes")} aria-label={changesTabLabel(comparison)}>Changes</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
            <span>{document.lines.length} lines</span>
            <span aria-hidden="true">·</span>
            <span>{openCount} open</span>
            {view !== "changes" && selection.lineStart > 0 ? (
              <><span aria-hidden="true">·</span><span>L{selection.lineStart}{selection.lineEnd !== selection.lineStart ? `-L${selection.lineEnd}` : ""}</span></>
            ) : null}
          </div>
        </div>
        <div className="review-scroll min-h-0 flex-1 overflow-auto overscroll-contain">
          <div className="reader-alert mx-auto max-w-[56rem] px-[clamp(1.25rem,5vw,4rem)] pt-4">
            <SourceStateBanner state={sourceState} annotations={review.annotations} />
          </div>
          <div className="reader-document mx-auto max-w-[56rem] px-[clamp(1.25rem,5vw,4rem)] pb-[clamp(5rem,14vh,8rem)] pt-5">
            {document.format === "source" ? null : (
              <TabsContent value="rendered">
                <RenderedMarkdown
                  document={document}
                  review={review}
                  comparison={comparison}
                  selection={selection}
                  onSelect={onSelect}
                />
              </TabsContent>
            )}
            <TabsContent value="source">
              <SourceReader document={document} review={review} selection={selection} onSelect={onSelect} />
            </TabsContent>
            <TabsContent value="changes">
              <ChangesView comparison={comparison} document={document} selection={selection} onSelect={onSelect} />
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </section>
  )
}

function defaultView(document: ReviewDocument, comparison: ReviewComparison): ReaderView {
  if (comparison.state === "diff") return "changes"
  return document.format === "source" ? "source" : "rendered"
}
