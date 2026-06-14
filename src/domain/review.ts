import { createAnnotationId } from "./ids.ts";
import type { ReviewDocument } from "./document.ts";

export type AnnotationKind = "issue" | "question" | "suggestion" | "decision" | "note";
export type AnnotationSeverity = "blocker" | "major" | "minor" | "note";
export type AnnotationStatus = "open" | "resolved";
export type AnnotationAnchorState = "ok" | "moved" | "not-found";

export interface AnnotationAnchor {
  state: AnnotationAnchorState;
  lineStart: number | null;
  lineEnd: number | null;
  sourceText: string | null;
}

export interface Annotation {
  id: string;
  lineStart: number;
  lineEnd: number;
  section: string | null;
  selectedText: string | null;
  kind: AnnotationKind;
  severity: AnnotationSeverity;
  status: AnnotationStatus;
  note: string;
  agentAction: string;
  createdAt: string;
  updatedAt: string;
  anchorText: string | null;
  anchorState?: AnnotationAnchorState;
  anchor?: AnnotationAnchor | null;
}

export interface Review {
  documentPath: string;
  documentDigest: string;
  summary: string;
  annotations: Annotation[];
  createdAt: string;
  updatedAt: string;
}

export interface ReviewDraft {
  path: string;
  summary?: unknown;
  annotations?: unknown;
}

const kinds = new Set<AnnotationKind>(["issue", "question", "suggestion", "decision", "note"]);
const severities = new Set<AnnotationSeverity>(["blocker", "major", "minor", "note"]);
const statuses = new Set<AnnotationStatus>(["open", "resolved"]);

export function createEmptyReview(path: string, digest: string): Review {
  const now = new Date().toISOString();
  return { documentPath: path, documentDigest: digest, summary: "", annotations: [], createdAt: now, updatedAt: now };
}

export function normalizeReviewDraft(
  draft: ReviewDraft,
  digest: string,
  sectionLookup: (line: number) => string | null,
  anchorTextLookup: (annotation: Pick<Annotation, "id" | "lineStart" | "lineEnd">) => string | null = () => null,
): Review {
  const now = new Date().toISOString();
  const annotations = Array.isArray(draft.annotations)
    ? draft.annotations.map((item) => normalizeAnnotation(item, now, sectionLookup, anchorTextLookup))
    : [];
  return {
    documentPath: draft.path,
    documentDigest: digest,
    summary: typeof draft.summary === "string" ? draft.summary : "",
    annotations,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeAnnotation(
  input: unknown,
  now: string,
  sectionLookup: (line: number) => string | null,
  anchorTextLookup: (annotation: Pick<Annotation, "id" | "lineStart" | "lineEnd">) => string | null,
): Annotation {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("annotation must be an object");
  }
  const record = input as Record<string, unknown>;
  const lineStart = positiveInteger(record.lineStart, "lineStart");
  const lineEnd = positiveInteger(record.lineEnd ?? record.lineStart, "lineEnd");
  if (lineEnd < lineStart) throw new Error("lineEnd must be greater than or equal to lineStart");
  const kind = enumValue(record.kind, kinds, "kind", "note");
  const severity = enumValue(record.severity, severities, "severity", "note");
  const status = enumValue(record.status, statuses, "status", "open");
  const createdAt = typeof record.createdAt === "string" ? record.createdAt : now;
  const id = typeof record.id === "string" && record.id.trim() !== "" ? record.id : createAnnotationId();
  const anchorText = anchorTextLookup({ id, lineStart, lineEnd })
    ?? optionalString(record.anchorText)
    ?? anchorSourceText(record.anchor)
    ?? null;
  return {
    id,
    lineStart,
    lineEnd,
    section: typeof record.section === "string" ? record.section : sectionLookup(lineStart),
    selectedText: optionalString(record.selectedText),
    kind,
    severity,
    status,
    note: requiredString(record.note, "note"),
    agentAction: typeof record.agentAction === "string" ? record.agentAction : "",
    createdAt,
    updatedAt: now,
    anchorText,
  };
}

export function withResolvedAnchors(document: ReviewDocument, review: Review): Review {
  return {
    ...review,
    annotations: review.annotations.map((annotation) => {
      const anchor = resolveAnchor(document, annotation);
      return { ...annotation, anchor, anchorState: anchor?.state };
    }),
  };
}

export function sourceTextForLines(document: ReviewDocument, start: number, end: number): string | null {
  const lines = document.lines.filter((line) => line.number >= start && line.number <= end);
  if (lines.length !== end - start + 1) return null;
  const text = lines.map((line) => line.text).join("\n");
  return text.trim() === "" ? null : text;
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>, field: string, fallback: T): T {
  if (value == null || value === "") return fallback;
  if (typeof value === "string" && allowed.has(value as T)) return value as T;
  throw new Error(`${field} is invalid`);
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} is required`);
  return value.trim();
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function anchorSourceText(input: unknown): string | null {
  if (input == null || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  return optionalString(record.sourceText);
}

function resolveAnchor(document: ReviewDocument, annotation: Annotation): AnnotationAnchor | null {
  if (annotation.anchorText == null || annotation.anchorText.trim() === "") return null;
  const current = sourceTextForLines(document, annotation.lineStart, annotation.lineEnd);
  if (sameSource(current, annotation.anchorText)) {
    return {
      state: "ok",
      lineStart: annotation.lineStart,
      lineEnd: annotation.lineEnd,
      sourceText: annotation.anchorText,
    };
  }
  const moved = findAnchor(document, annotation.anchorText);
  if (moved != null) return { ...moved, state: "moved", sourceText: annotation.anchorText };
  return { state: "not-found", lineStart: null, lineEnd: null, sourceText: annotation.anchorText };
}

function findAnchor(document: ReviewDocument, anchorText: string): Pick<AnnotationAnchor, "lineStart" | "lineEnd"> | null {
  const lineCount = anchorText.split(/\r?\n/).length;
  const maxStart = document.lines.length - lineCount + 1;
  for (let start = 1; start <= maxStart; start += 1) {
    const end = start + lineCount - 1;
    if (sameSource(sourceTextForLines(document, start, end), anchorText)) return { lineStart: start, lineEnd: end };
  }
  return null;
}

function sameSource(left: string | null, right: string): boolean {
  return compactText(left ?? "") === compactText(right);
}

function compactText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}
