import type { Annotation, Review, ReviewDocument, ReviewSourceState, SelectionRange } from "@/api/types"
import { ReaderPane } from "@/components/ReaderPane"
import { ReviewSidebar } from "@/components/ReviewSidebar"
import type { AnnotationFormValue } from "@/lib/review-utils"

interface WorkspaceProps {
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
  onSelection: (selection: SelectionRange) => void
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

export function Workspace(props: WorkspaceProps) {
  return (
    <main className="grid h-[calc(100dvh-2.5rem)] min-h-0 grid-cols-1 grid-rows-[55%_45%] overflow-hidden bg-card md:grid-cols-[minmax(0,1fr)_minmax(320px,360px)] md:grid-rows-1">
      <ReaderPane
        document={props.document}
        review={props.review}
        selection={props.selection}
        sourceState={props.sourceState}
        onSelect={props.onSelection}
      />
      <ReviewSidebar
        document={props.document}
        review={props.review}
        selection={props.selection}
        sourceState={props.sourceState}
        form={props.form}
        summaryDraft={props.summaryDraft}
        exportMarkdown={props.exportMarkdown}
        exportLoading={props.exportLoading}
        saving={props.saving}
        confirming={props.confirming}
        onFormChange={props.onFormChange}
        onFormSubmit={props.onFormSubmit}
        onFormReset={props.onFormReset}
        onSummaryChange={props.onSummaryChange}
        onSummarySave={props.onSummarySave}
        onOpenAnnotation={props.onOpenAnnotation}
        onEditAnnotation={props.onEditAnnotation}
        onDeleteAnnotation={props.onDeleteAnnotation}
        onStatusChange={props.onStatusChange}
        onConfirmCurrent={props.onConfirmCurrent}
        onCopyExport={props.onCopyExport}
      />
    </main>
  )
}
