import { useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"
import type { Annotation, Review, ReviewDocument, ReviewSourceState, SelectionRange } from "@/api/types"
import { AgentExport } from "@/components/AgentExport"
import { AnnotationList } from "@/components/AnnotationList"
import { AnnotationPanel } from "@/components/AnnotationPanel"
import { ReviewSummary } from "@/components/ReviewSummary"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { annotationAnchorState, type AnnotationFormValue } from "@/lib/review-utils"

interface ReviewSidebarProps {
  document: ReviewDocument
  review: Review
  selection: SelectionRange
  sourceState: ReviewSourceState
  form: AnnotationFormValue
  summaryDraft: string
  exportMarkdown: string
  exportLoading: boolean
  saving: boolean
  confirming: boolean
  onFormChange: (form: AnnotationFormValue) => void
  onFormSubmit: () => void
  onFormReset: () => void
  onSummaryChange: (summary: string) => void
  onSummarySave: () => void
  onOpenAnnotation: (annotation: Annotation) => void
  onEditAnnotation: (annotation: Annotation) => void
  onDeleteAnnotation: (annotation: Annotation) => void
  onStatusChange: (annotation: Annotation, status: Annotation["status"]) => void
  onConfirmCurrent: () => void
  onCopyExport: () => void
}

export function ReviewSidebar(props: ReviewSidebarProps) {
  const [tab, setTab] = useState("write")
  const openCount = props.review.annotations.filter((item) => item.status === "open").length
  const openDriftCount = props.review.annotations.filter((item) => item.status === "open" && annotationAnchorState(item) !== "ok").length
  const summaryDirty = props.summaryDraft !== props.review.summary

  useEffect(() => setTab("write"), [props.selection.lineStart, props.selection.lineEnd, props.selection.selectedText])

  return (
    <aside className="review-rail grid min-h-0 grid-rows-[auto_1fr] border-t bg-muted/55 md:border-l md:border-t-0">
      <div className="flex h-9 items-center justify-between gap-3 border-b px-3">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Review</div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{props.saving ? "Saving…" : "Saved locally"}</span>
          <Badge variant={openCount > 0 ? "secondary" : "outline"} className="h-5 px-1.5 text-[10px]">{openCount} open</Badge>
        </div>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="min-h-0 gap-0 overflow-hidden">
        <TabsList variant="line" className="mx-2 mt-1 grid h-8 w-auto grid-cols-3 border-b">
          <TabsTrigger value="write" className="text-xs">Feedback</TabsTrigger>
          <TabsTrigger value="notes" className="text-xs">Notes <span className="text-[10px]">{openCount}</span></TabsTrigger>
          <TabsTrigger value="export" className="text-xs">Export</TabsTrigger>
        </TabsList>
        <div className="review-scroll min-h-0 flex-1 overflow-auto">
          <TabsContent value="write" className="p-3">
            <AnnotationPanel
              form={props.form}
              selection={props.selection}
              maxLine={props.document.lines.length}
              saving={props.saving}
              onChange={props.onFormChange}
              onSubmit={props.onFormSubmit}
              onReset={props.onFormReset}
            />
          </TabsContent>
          <TabsContent value="notes" className="grid gap-3 p-3">
            {props.sourceState === "changed" ? (
              <div className="rounded-lg border border-sev-major/30 bg-sev-major/10 p-3">
                <div className="text-sm font-semibold">Review the changed version</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {openDriftCount > 0
                    ? `Resolve or re-anchor ${openDriftCount} drifting open ${openDriftCount === 1 ? "note" : "notes"} first.`
                    : "All open notes are anchored. Start the next review round from this version."}
                </p>
                <Button className="mt-3 w-full" type="button" size="sm" variant="outline" disabled={props.confirming || props.saving || openDriftCount > 0} onClick={props.onConfirmCurrent}>
                  <RefreshCw /> Use as new baseline
                </Button>
              </div>
            ) : null}
            <ReviewSummary
              value={props.summaryDraft}
              dirty={summaryDirty}
              saving={props.saving}
              onChange={props.onSummaryChange}
              onSave={props.onSummarySave}
            />
            <AnnotationList
              annotations={props.review.annotations}
              saving={props.saving}
              onOpen={props.onOpenAnnotation}
              onEdit={(annotation) => {
                setTab("write")
                props.onEditAnnotation(annotation)
              }}
              onDelete={props.onDeleteAnnotation}
              onStatusChange={props.onStatusChange}
            />
          </TabsContent>
          <TabsContent value="export" className="p-3">
            <AgentExport
              markdown={props.exportMarkdown}
              loading={props.exportLoading}
              annotations={props.review.annotations}
              onCopy={props.onCopyExport}
            />
          </TabsContent>
        </div>
      </Tabs>
    </aside>
  )
}
