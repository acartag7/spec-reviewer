export type LineKind = "heading" | "list" | "quote" | "code" | "blank" | "normal"
export type ReviewSourceState = "unreviewed" | "current" | "changed" | "missing"
export type AnnotationKind = "issue" | "question" | "suggestion" | "decision" | "note"
export type AnnotationSeverity = "blocker" | "major" | "minor" | "note"
export type AnnotationStatus = "open" | "resolved"
export type AnnotationAnchorState = "ok" | "moved" | "ambiguous" | "not-found"

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

export interface AnnotationAnchor {
  state: AnnotationAnchorState
  lineStart?: number | null
  lineEnd?: number | null
  sourceText?: string | null
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
  anchorState?: AnnotationAnchorState
  anchor?: AnnotationAnchor | null
}

export interface ReviewMetrics {
  activeMs: number
}

export interface Review {
  documentPath: string
  documentDigest: string
  revision: number
  summary: string
  annotations: Annotation[]
  createdAt: string
  updatedAt: string
  metrics: ReviewMetrics
}

export interface OpenDocumentResult {
  document: ReviewDocument
  review: Review
  stale: boolean
  sourceState: ReviewSourceState
  comparison: ReviewComparison
}

export type DiffRow =
  | { kind: "context" | "add" | "remove"; oldLine: number | null; newLine: number | null; text: string }
  | { kind: "no-newline"; oldLine: null; newLine: null; text: "No newline at end of file" }
  | { kind: "gap"; hiddenOld: number; hiddenNew: number }

interface ComparedRound {
  roundId: string
  completedAt: string
  beforeDigest: string
  afterDigest: string
}

export type ReviewComparison =
  | { state: "unavailable"; reason: "no-baseline" | "baseline-unavailable" | "immutable-upload" }
  | (ComparedRound & { state: "unchanged"; added: 0; removed: 0; rows: [] })
  | (ComparedRound & { state: "too-large"; added: null; removed: null; rows: [] })
  | (ComparedRound & { state: "diff"; added: number; removed: number; rows: DiffRow[] })

export interface RecentReview {
  id: string
  documentPath: string
  title: string
  documentDigest: string
  annotations: number
  openAnnotations: number
  updatedAt: string
  activeMs: number
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
  baseRevision: number
  summary: string
  annotations: Annotation[]
  activeMsDelta?: number
}

export type ReviewCompletion =
  | { status: "finished"; path: string; markdown: string; openAnnotations: number; carriedOver: number; activeMs: number }
  | { status: "canceled"; path: string; reason: string | null; activeMs: number }
