import type { Annotation, AnnotationKind, AnnotationSeverity, Review, SelectionRange } from "@/api/types"

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
  note: string
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
    note: "",
  }
}

export function formFromAnnotation(annotation: Annotation): AnnotationFormValue {
  return {
    id: annotation.id,
    createdAt: annotation.createdAt,
    lineStart: annotation.lineStart,
    lineEnd: annotation.lineEnd,
    selectedText: annotation.selectedText ?? "",
    severity: annotation.severity,
    kind: annotation.kind,
    note: annotation.note,
  }
}

export function createAnnotation(form: AnnotationFormValue, selection: SelectionRange): Annotation {
  const now = new Date().toISOString()
  return {
    id: form.id || `ann_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
    lineStart: Number(form.lineStart || selection.lineStart || 1),
    lineEnd: Number(form.lineEnd || selection.lineEnd || form.lineStart || 1),
    section: null,
    selectedText: form.selectedText.trim() || selection.selectedText || null,
    kind: form.kind,
    severity: form.severity,
    status: "open",
    note: form.note.trim(),
    agentAction: "",
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
