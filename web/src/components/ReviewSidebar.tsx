import { useEffect, useState } from "react"
import type { Annotation, Review, ReviewDocument, SelectionRange } from "@/api/types"
import { AgentExport } from "@/components/AgentExport"
import { AnnotationList } from "@/components/AnnotationList"
import { AnnotationPanel } from "@/components/AnnotationPanel"
import { ReviewSummary } from "@/components/ReviewSummary"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { hasAnnotationDraft, type AnnotationFormValue } from "@/lib/review-utils"

interface ReviewSidebarProps {
  document: ReviewDocument
  review: Review
  selection: SelectionRange
  form: AnnotationFormValue
  summary: string
  exportMarkdown: string
  exportLoading: boolean
  saving: boolean
  terminalPending: boolean
  selectionRequest: number
  onFormChange: (form: AnnotationFormValue) => void
  onFormSubmit: () => void
  onFormReset: () => void
  onSummaryChange: (summary: string) => void
  onSummarySave: () => void
  onOpenAnnotation: (annotation: Annotation) => void
  onEditAnnotation: (annotation: Annotation) => void
  onStatusAnnotation: (annotation: Annotation, status: Annotation["status"]) => void
  onDeleteAnnotation: (annotation: Annotation) => void
  onCopyExport: () => void
}

export function ReviewSidebar(props: ReviewSidebarProps) {
  const [tab, setTab] = useState("write")
  const openCount = props.review.annotations.filter((item) => item.status === "open").length
  const hasDraft = hasAnnotationDraft(props.form, props.review.annotations) || props.summary !== props.review.summary
  const savedAnnotation = props.review.annotations.find((item) => item.id === props.form.id)
  const keepsSavedRange = savedAnnotation != null
    && savedAnnotation.lineStart === props.form.lineStart
    && savedAnnotation.lineEnd === props.form.lineEnd

  useEffect(() => setTab("write"), [props.selectionRequest])

  return (
    <aside aria-labelledby="review-sidebar-heading" className="grid min-h-0 grid-rows-[auto_1fr] border-t bg-muted/55 md:border-l md:border-t-0">
      <div className="flex h-9 items-center justify-between gap-3 border-b px-3">
        <h2 id="review-sidebar-heading" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Review</h2>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{props.saving ? "Saving…" : hasDraft ? "Unsaved draft" : "Saved locally"}</span>
          <Badge variant={openCount > 0 ? "secondary" : "outline"} className="h-5 px-1.5 text-[10px]">{openCount} open</Badge>
        </div>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="min-h-0 gap-0 overflow-hidden">
        <TabsList variant="line" className="mx-2 mt-1 grid h-8 w-auto grid-cols-3 border-b">
          <TabsTrigger value="write" className="text-xs" onClick={() => setTab("write")}>Feedback</TabsTrigger>
          <TabsTrigger value="notes" className="text-xs" onClick={() => setTab("notes")}>Notes <span className="text-[10px]">{openCount}</span></TabsTrigger>
          <TabsTrigger value="export" className="text-xs" onClick={() => setTab("export")}>Export</TabsTrigger>
        </TabsList>
        <div className="review-scroll min-h-0 flex-1 overflow-auto p-2">
          <TabsContent value="write" className="rounded-md border bg-card p-3 shadow-sm">
            <AnnotationPanel
              form={props.form}
              selection={props.selection}
              maxLine={props.document.lines.length}
              allowStoredRange={keepsSavedRange}
              saving={props.saving}
              locked={props.terminalPending}
              onChange={props.onFormChange}
              onSubmit={props.onFormSubmit}
              onReset={props.onFormReset}
            />
          </TabsContent>
          <TabsContent value="notes" className="grid gap-3 rounded-md border bg-card p-3 shadow-sm">
            <ReviewSummary
              value={props.summary}
              dirty={props.summary !== props.review.summary}
              saving={props.saving}
              locked={props.terminalPending}
              onChange={props.onSummaryChange}
              onRevert={() => props.onSummaryChange(props.review.summary)}
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
              onStatus={props.onStatusAnnotation}
              onDelete={props.onDeleteAnnotation}
            />
          </TabsContent>
          <TabsContent value="export" className="rounded-md border bg-card p-3 shadow-sm">
            <AgentExport
              markdown={props.exportMarkdown}
              loading={props.exportLoading}
              disabled={props.saving}
              annotations={props.review.annotations}
              onCopy={props.onCopyExport}
            />
          </TabsContent>
        </div>
      </Tabs>
    </aside>
  )
}
