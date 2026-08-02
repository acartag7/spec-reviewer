import { useState } from "react"
import type { Annotation, Review, ReviewComparison, ReviewDocument, ReviewSourceState, SelectionRange } from "@/api/types"
import { ReaderPane } from "@/components/ReaderPane"
import { ReviewSidebar } from "@/components/ReviewSidebar"
import type { AnnotationFormValue } from "@/lib/review-utils"

interface WorkspaceProps {
  document: ReviewDocument
  review: Review
  selection: SelectionRange
  sourceState: ReviewSourceState
  comparison: ReviewComparison
  form: AnnotationFormValue
  summary: string
  exportMarkdown: string
  exportLoading: boolean
  saving: boolean
  terminalPending: boolean
  onSelection: (selection: SelectionRange) => void
  onFormChange: (form: AnnotationFormValue) => void
  onFormSubmit: () => void
  onFormReset: () => void
  onSummaryChange: (summary: string) => void
  onSummarySave: () => void
  onEditAnnotation: (annotation: Annotation) => void
  onStatusAnnotation: (annotation: Annotation, status: Annotation["status"]) => void
  onDeleteAnnotation: (annotation: Annotation) => void
  onCopyExport: () => void
}

export function Workspace(props: WorkspaceProps) {
  const [openRequest, setOpenRequest] = useState<{ documentPath: string; line: number } | null>(null)
  const [selectionRequest, setSelectionRequest] = useState(0)
  const selectLines = (selection: SelectionRange) => {
    if (props.terminalPending) return
    props.onSelection(selection)
    setSelectionRequest((request) => request + 1)
  }
  return (
    <main className="grid h-[calc(100dvh-2.5rem)] min-h-0 grid-cols-1 grid-rows-[55%_45%] overflow-hidden bg-card md:grid-cols-[minmax(0,1fr)_minmax(320px,360px)] md:grid-rows-1">
      <ReaderPane
        document={props.document}
        review={props.review}
        selection={props.selection}
        sourceState={props.sourceState}
        comparison={props.comparison}
        openRequest={openRequest}
        onSelect={selectLines}
      />
      <ReviewSidebar
        document={props.document}
        review={props.review}
        selection={props.selection}
        form={props.form}
        summary={props.summary}
        exportMarkdown={props.exportMarkdown}
        exportLoading={props.exportLoading}
        saving={props.saving}
        terminalPending={props.terminalPending}
        selectionRequest={selectionRequest}
        onFormChange={props.onFormChange}
        onFormSubmit={props.onFormSubmit}
        onFormReset={props.onFormReset}
        onSummaryChange={props.onSummaryChange}
        onSummarySave={props.onSummarySave}
        onOpenAnnotation={(annotation) => setOpenRequest({
          documentPath: props.document.path,
          line: annotation.anchor?.state === "moved" ? annotation.anchor.lineStart ?? annotation.lineStart : annotation.lineStart,
        })}
        onEditAnnotation={props.onEditAnnotation}
        onStatusAnnotation={props.onStatusAnnotation}
        onDeleteAnnotation={props.onDeleteAnnotation}
        onCopyExport={props.onCopyExport}
      />
    </main>
  )
}
