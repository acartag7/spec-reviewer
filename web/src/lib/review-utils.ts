import type {
  Annotation,
  AnnotationAnchorState,
  AnnotationKind,
  AnnotationSeverity,
  AnnotationStatus,
  Review,
  SelectionRange,
} from "@/api/types"

export const severities: Array<{ value: AnnotationSeverity; label: string }> = [
  { value: "major", label: "Major" },
  { value: "blocker", label: "Blocker" },
  { value: "minor", label: "Minor" },
  { value: "note", label: "Note" },
]

export const kinds: Array<{ value: AnnotationKind; label: string }> = [
  { value: "issue", label: "Issue" },
  { value: "suggestion", label: "Suggestion" },
  { value: "question", label: "Question" },
  { value: "decision", label: "Decision" },
  { value: "note", label: "Note" },
]

export interface AnnotationFormValue {
  id: string
  createdAt: string
  lineStart: number
  lineEnd: number
  selectedText: string
  severity: AnnotationSeverity
  kind: AnnotationKind
  status: AnnotationStatus
  note: string
  agentAction: string
}

export function hasAnnotationDraft(form: AnnotationFormValue, annotations: Annotation[]): boolean {
  if (form.id === "") return form.note.trim() !== "" || form.agentAction.trim() !== ""
  const saved = annotations.find((annotation) => annotation.id === form.id)
  if (saved == null) return true
  return form.lineStart !== saved.lineStart
    || form.lineEnd !== saved.lineEnd
    || form.severity !== saved.severity
    || form.kind !== saved.kind
    || form.status !== saved.status
    || form.note.trim() !== saved.note
    || form.agentAction.trim() !== saved.agentAction
}

export interface AnchorDriftSummary {
  moved: number
  ambiguous: number
  notFound: number
  total: number
}

export function emptyForm(selection: SelectionRange): AnnotationFormValue {
  return {
    id: "",
    createdAt: "",
    lineStart: selection.lineStart,
    lineEnd: selection.lineEnd,
    selectedText: selection.selectedText,
    severity: "major",
    kind: "issue",
    status: "open",
    note: "",
    agentAction: "",
  }
}

export function formFromAnnotation(annotation: Annotation): AnnotationFormValue {
  return {
    id: annotation.id,
    createdAt: annotation.createdAt,
    lineStart: annotation.lineStart,
    lineEnd: annotation.lineEnd,
    selectedText: annotation.anchor?.state === "ok" ? annotation.anchor.sourceText ?? "" : "",
    severity: annotation.severity,
    kind: annotation.kind,
    status: annotation.status,
    note: annotation.note,
    agentAction: annotation.agentAction,
  }
}

export function createAnnotation(form: AnnotationFormValue, selection: SelectionRange): Annotation {
  const now = new Date().toISOString()
  return {
    id: form.id || `ann_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
    lineStart: Number(form.lineStart || selection.lineStart || 1),
    lineEnd: Number(form.lineEnd || selection.lineEnd || form.lineStart || 1),
    section: null,
    selectedText: null,
    kind: form.kind,
    severity: form.severity,
    status: form.status,
    note: form.note.trim(),
    agentAction: form.agentAction.trim(),
    createdAt: form.createdAt || now,
    updatedAt: now,
  }
}

export function upsertAnnotation(review: Review, annotation: Annotation): Review {
  const existing = review.annotations.findIndex((item) => item.id === annotation.id)
  const annotations = [...review.annotations]
  if (existing >= 0) annotations.splice(existing, 1, annotation)
  else annotations.push(annotation)
  return { ...review, annotations }
}

export function removeAnnotation(review: Review, id: string): Review {
  return { ...review, annotations: review.annotations.filter((item) => item.id !== id) }
}

export function overlappingOpenAnnotations(annotations: Annotation[], line: number): Annotation[] {
  return annotations.filter((item) => {
    return item.status === "open" && item.lineStart <= line && item.lineEnd >= line
  })
}

export function sortAnnotations(annotations: Annotation[]): Annotation[] {
  return [...annotations].sort((a, b) => {
    const status = Number(a.status === "resolved") - Number(b.status === "resolved")
    if (status !== 0) return status
    return a.lineStart - b.lineStart
  })
}

export function rangeLabel(annotation: Pick<Annotation, "lineStart" | "lineEnd">): string {
  return annotation.lineStart === annotation.lineEnd
    ? `L${annotation.lineStart}`
    : `L${annotation.lineStart}-${annotation.lineEnd}`
}

export function annotationAnchorState(annotation: Annotation): AnnotationAnchorState | null {
  return annotation.anchor?.state ?? annotation.anchorState ?? null
}

export function annotationAnchorRange(annotation: Annotation): string | null {
  const start = annotation.anchor?.lineStart
  if (start == null) return null
  const end = annotation.anchor?.lineEnd ?? start
  return rangeLabel({ lineStart: start, lineEnd: end })
}

export function anchorStateLabel(state: AnnotationAnchorState): string {
  if (state === "not-found") return "anchor not found"
  return `anchor ${state}`
}

export function anchorDriftSummary(annotations: Annotation[]): AnchorDriftSummary {
  return annotations.reduce<AnchorDriftSummary>(
    (summary, annotation) => {
      const state = annotationAnchorState(annotation)
      if (state === "moved") summary.moved += 1
      if (state === "ambiguous") summary.ambiguous += 1
      if (state === "not-found") summary.notFound += 1
      summary.total = summary.moved + summary.ambiguous + summary.notFound
      return summary
    },
    { moved: 0, ambiguous: 0, notFound: 0, total: 0 },
  )
}

export function anchorDriftText(summary: AnchorDriftSummary): string {
  const parts = [
    summary.moved > 0 ? `${summary.moved} moved` : "",
    summary.ambiguous > 0 ? `${summary.ambiguous} ambiguous` : "",
    summary.notFound > 0 ? `${summary.notFound} not found` : "",
  ].filter(Boolean)
  return parts.join(", ")
}
