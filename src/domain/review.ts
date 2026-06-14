import { createAnnotationId } from "./ids.ts";

export type AnnotationKind = "issue" | "question" | "suggestion" | "decision" | "note";
export type AnnotationSeverity = "blocker" | "major" | "minor" | "note";
export type AnnotationStatus = "open" | "resolved";

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

export function normalizeReviewDraft(draft: ReviewDraft, digest: string, sectionLookup: (line: number) => string | null): Review {
  const now = new Date().toISOString();
  const annotations = Array.isArray(draft.annotations)
    ? draft.annotations.map((item) => normalizeAnnotation(item, now, sectionLookup))
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

function normalizeAnnotation(input: unknown, now: string, sectionLookup: (line: number) => string | null): Annotation {
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
  return {
    id: typeof record.id === "string" && record.id.trim() !== "" ? record.id : createAnnotationId(),
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
  };
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
