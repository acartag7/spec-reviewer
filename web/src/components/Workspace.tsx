import { useState } from "react"
import type { Annotation, Review, ReviewComparison, ReviewDocument, ReviewSourceState, SelectionRange } from "@/api/types"
import { AgentExport } from "@/components/AgentExport"
import { AnnotationList } from "@/components/AnnotationList"
import { AnnotationPanel } from "@/components/AnnotationPanel"
import { ReaderPane } from "@/components/ReaderPane"
import type { AnnotationFormValue } from "@/lib/review-utils"

interface WorkspaceProps {
  document: ReviewDocument
  review: Review
  selection: SelectionRange
  sourceState: ReviewSourceState
  comparison: ReviewComparison
  form: AnnotationFormValue
  exportMarkdown: string
  exportLoading: boolean
  saving: boolean
  onSelection: (selection: SelectionRange) => void
  onFormChange: (form: AnnotationFormValue) => void
  onFormSubmit: () => void
  onFormReset: () => void
  onEditAnnotation: (annotation: Annotation) => void
  onStatusAnnotation: (annotation: Annotation, status: Annotation["status"]) => void
  onDeleteAnnotation: (annotation: Annotation) => void
  onCopyExport: () => void
}

export function Workspace(props: WorkspaceProps) {
  const [openRequest, setOpenRequest] = useState<{ documentPath: string; line: number } | null>(null)
  return (
    <main className="grid h-[calc(100dvh-3.5rem)] min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_390px]">
      <ReaderPane
        document={props.document}
        review={props.review}
        selection={props.selection}
        sourceState={props.sourceState}
        comparison={props.comparison}
        openRequest={openRequest}
        onSelect={props.onSelection}
      />
      <aside className="review-scroll grid min-h-0 gap-5 overflow-auto border-t bg-card p-4 lg:border-l lg:border-t-0">
        <AnnotationPanel
          form={props.form}
          selection={props.selection}
          saving={props.saving}
          onChange={props.onFormChange}
          onSubmit={props.onFormSubmit}
          onReset={props.onFormReset}
        />
        <div className="border-t" />
        <AnnotationList
          annotations={props.review.annotations}
          saving={props.saving}
          onOpen={(annotation) => setOpenRequest({
            documentPath: props.document.path,
            line: annotation.anchor?.state === "moved" ? annotation.anchor.lineStart ?? annotation.lineStart : annotation.lineStart,
          })}
          onEdit={props.onEditAnnotation}
          onStatus={props.onStatusAnnotation}
          onDelete={props.onDeleteAnnotation}
        />
        <div className="border-t" />
        <AgentExport
          markdown={props.exportMarkdown}
          loading={props.exportLoading}
          annotations={props.review.annotations}
          onCopy={props.onCopyExport}
        />
      </aside>
    </main>
  )
}
