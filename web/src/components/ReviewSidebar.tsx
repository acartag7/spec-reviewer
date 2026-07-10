import { useEffect, useState } from "react"
import { FileCheck2, ListChecks, MessageSquarePlus, RefreshCw, Send } from "lucide-react"
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
    <aside className="review-rail grid min-h-0 grid-rows-[auto_1fr] border-t bg-card lg:border-l lg:border-t-0">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><ListChecks className="size-4" /></span>
          <div>
            <div className="text-sm font-semibold">Review workspace</div>
            <div className="text-xs text-muted-foreground">{props.saving ? "Saving changes…" : "Changes save locally"}</div>
          </div>
        </div>
        <Badge variant={openCount > 0 ? "secondary" : "outline"}>{openCount} open</Badge>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="min-h-0 gap-0">
        <TabsList variant="line" className="mx-4 mt-2 grid h-10 w-auto grid-cols-3 border-b">
          <TabsTrigger value="write"><MessageSquarePlus /> Feedback</TabsTrigger>
          <TabsTrigger value="notes"><FileCheck2 /> Notes <span className="text-xs">{openCount}</span></TabsTrigger>
          <TabsTrigger value="export"><Send /> Export</TabsTrigger>
        </TabsList>
        <div className="review-scroll min-h-0 overflow-auto">
          <TabsContent value="write" className="p-4">
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
          <TabsContent value="notes" className="grid gap-4 p-4">
            {props.sourceState === "changed" ? (
              <div className="rounded-xl border border-sev-major/30 bg-sev-major/10 p-3">
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
          <TabsContent value="export" className="p-4">
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
