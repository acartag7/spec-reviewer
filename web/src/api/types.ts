export type LineKind = "heading" | "list" | "quote" | "code" | "blank" | "normal"
export type ReviewSourceState = "unreviewed" | "current" | "changed" | "missing"
export type AnnotationKind = "issue" | "question" | "suggestion" | "decision" | "note"
export type AnnotationSeverity = "blocker" | "major" | "minor" | "note"
export type AnnotationStatus = "open" | "resolved"

export interface DocumentLine {
  number: number
  text: string
  kind: LineKind
  sectionTitle: string | null
}

export interface ReviewDocument {
  path: string
  title: string
  digest: string
  lines: DocumentLine[]
  sections: Array<{ line: number; level: number; title: string }>
}

export interface Annotation {
  id: string
  lineStart: number
  lineEnd: number
  section: string | null
  selectedText: string | null
  kind: AnnotationKind
  severity: AnnotationSeverity
  status: AnnotationStatus
  note: string
  agentAction: string
  createdAt: string
  updatedAt: string
}

export interface Review {
  documentPath: string
  documentDigest: string
  summary: string
  annotations: Annotation[]
  createdAt: string
  updatedAt: string
}

export interface OpenDocumentResult {
  document: ReviewDocument
  review: Review
  stale: boolean
  sourceState: ReviewSourceState
}

export interface RecentReview {
  documentPath: string
  title: string
  documentDigest: string
  annotations: number
  openAnnotations: number
  updatedAt: string
  sourceState: ReviewSourceState
  currentDigest: string | null
}

export interface SelectionRange {
  lineStart: number
  lineEnd: number
  selectedText: string
}

export interface ReviewDraft {
  path: string
  summary: string
  annotations: Annotation[]
}
