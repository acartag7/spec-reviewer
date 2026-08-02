import { createAnnotationId } from "./ids.ts";
import { invalidReview } from "./errors.ts";
import { normalizeMetrics, type ReviewMetrics } from "./review-metrics.ts";
export { MAX_ACTIVE_MS, normalizeActiveMsDelta, normalizeMetrics } from "./review-metrics.ts";
export { sourceTextForLines, withResolvedAnchors } from "./anchor-resolver.ts";

export type AnnotationKind = "issue" | "question" | "suggestion" | "decision" | "note";
export type AnnotationSeverity = "blocker" | "major" | "minor" | "note";
export type AnnotationStatus = "open" | "resolved";
export type AnnotationAnchorState = "ok" | "moved" | "ambiguous" | "not-found";

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
  revision: number;
  summary: string;
  annotations: Annotation[];
  createdAt: string;
  updatedAt: string;
  metrics: ReviewMetrics;
}

export interface ReviewDraft {
  path: string;
  baseRevision?: unknown;
  summary?: unknown;
  annotations?: unknown;
  activeMsDelta?: unknown;
}

const kinds = new Set<AnnotationKind>(["issue", "question", "suggestion", "decision", "note"]);
const severities = new Set<AnnotationSeverity>(["blocker", "major", "minor", "note"]);
const statuses = new Set<AnnotationStatus>(["open", "resolved"]);

export const MAX_ANNOTATIONS = 200;
export const MAX_ANNOTATION_SPAN = 500;
export const MAX_TOTAL_ANNOTATION_SPAN = 20_000;
export const MAX_TEXT_BYTES = 64 * 1024;
export const MAX_ANNOTATION_ID_BYTES = 128;

export function createEmptyReview(path: string, digest: string): Review {
  const now = new Date().toISOString();
  return { documentPath: path, documentDigest: digest, revision: 0, summary: "", annotations: [], createdAt: now, updatedAt: now, metrics: { activeMs: 0 } };
}

export function normalizeReviewDraft(
  draft: ReviewDraft,
  digest: string,
  sectionLookup: (line: number) => string | null,
  anchorTextLookup: (annotation: Pick<Annotation, "id" | "lineStart" | "lineEnd">) => string | null = () => null,
  previous: Review | null = null,
): Review {
  if (draft.summary !== undefined && typeof draft.summary !== "string") {
    throw invalidReview("summary must be a string");
  }
  if (typeof draft.summary === "string" && draft.summary !== previous?.summary) {
    assertByteLength(draft.summary, MAX_TEXT_BYTES, "summary");
  }
  if (draft.annotations !== undefined && !Array.isArray(draft.annotations)) {
    throw invalidReview("annotations must be an array");
  }
  if (Array.isArray(draft.annotations)
    && draft.annotations.length > MAX_ANNOTATIONS
    && !isLegacyAnnotationReduction(draft.annotations, previous)) {
    if ((previous?.annotations.length ?? 0) > MAX_ANNOTATIONS) {
      throw invalidReview(`legacy review exceeds ${MAX_ANNOTATIONS} annotations; delete annotations before editing other fields`);
    }
    throw invalidReview(`annotations must contain at most ${MAX_ANNOTATIONS} items`);
  }
  const now = new Date().toISOString();
  const previousById = new Map(previous?.annotations.map((annotation) => [annotation.id, annotation]) ?? []);
  const seenIds = new Set<string>();
  const annotations = Array.isArray(draft.annotations)
    ? draft.annotations.map((item) => normalizeAnnotation(
      item,
      now,
      sectionLookup,
      anchorTextLookup,
      previousById,
      seenIds,
    ))
    : previous?.annotations ?? [];
  return {
    documentPath: draft.path,
    documentDigest: digest,
    revision: previous?.revision ?? 0,
    summary: typeof draft.summary === "string" ? draft.summary : previous?.summary ?? "",
    annotations,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    metrics: normalizeMetrics(previous?.metrics, draft.activeMsDelta),
  };
}

function normalizeAnnotation(
  input: unknown,
  now: string,
  sectionLookup: (line: number) => string | null,
  anchorTextLookup: (annotation: Pick<Annotation, "id" | "lineStart" | "lineEnd">) => string | null,
  previousById: Map<string, Annotation>,
  seenIds: Set<string>,
): Annotation {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    throw invalidReview("annotation must be an object");
  }
  const record = input as Record<string, unknown>;
  const lineStart = positiveInteger(record.lineStart, "lineStart");
  const lineEnd = positiveInteger(record.lineEnd ?? record.lineStart, "lineEnd");
  if (lineEnd < lineStart) throw invalidReview("lineEnd must be greater than or equal to lineStart");
  const kind = enumValue(record.kind, kinds, "kind", "note");
  const severity = enumValue(record.severity, severities, "severity", "note");
  const status = enumValue(record.status, statuses, "status", "open");
  if (record.id !== undefined && typeof record.id !== "string") throw invalidReview("annotation id must be a string");
  const id = typeof record.id === "string" && record.id.trim() !== "" ? record.id.trim() : createAnnotationId();
  if (seenIds.has(id)) throw invalidReview("annotation ids must be unique");
  seenIds.add(id);
  const previous = previousById.get(id);
  if (previous == null) assertByteLength(id, MAX_ANNOTATION_ID_BYTES, "annotation id");
  const sameRange = previous?.lineStart === lineStart && previous.lineEnd === lineEnd;
  const anchorText = anchorTextLookup({ id, lineStart, lineEnd });
  const note = requiredString(record.note, "note");
  if (note !== previous?.note) assertByteLength(note, MAX_TEXT_BYTES, "note");
  if (record.agentAction !== undefined && typeof record.agentAction !== "string") {
    throw invalidReview("agentAction must be a string");
  }
  const agentAction = typeof record.agentAction === "string" ? record.agentAction : "";
  if (agentAction !== previous?.agentAction) assertByteLength(agentAction, MAX_TEXT_BYTES, "agentAction");
  return {
    id,
    lineStart,
    lineEnd,
    section: sameRange ? previous.section : sectionLookup(lineStart),
    selectedText: anchorText ?? (sameRange ? previous.selectedText : null),
    kind,
    severity,
    status,
    note,
    agentAction,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    anchorText,
  };
}

function isLegacyAnnotationReduction(value: unknown[], previous: Review | null): boolean {
  if (previous == null || previous.annotations.length <= MAX_ANNOTATIONS || value.length >= previous.annotations.length) {
    return false;
  }
  const previousById = new Map(previous.annotations.map((annotation) => [annotation.id, annotation]));
  return value.every((item) => {
    if (item == null || typeof item !== "object" || Array.isArray(item)) return false;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const stored = previousById.get(id);
    const lineEnd = record.lineEnd == null ? record.lineStart : record.lineEnd;
    return stored != null && record.lineStart === stored.lineStart && lineEnd === stored.lineEnd;
  });
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>, field: string, fallback: T): T {
  if (value == null || value === "") return fallback;
  if (typeof value === "string" && allowed.has(value as T)) return value as T;
  throw invalidReview(`${field} is invalid`);
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw invalidReview(`${field} must be a positive integer`);
  }
  return value;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw invalidReview(`${field} is required`);
  return value.trim();
}

function assertByteLength(value: string, limit: number, field: string): void {
  if (Buffer.byteLength(value, "utf8") > limit) throw invalidReview(`${field} is too large`);
}
