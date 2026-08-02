import { isAbsolute, resolve } from "node:path";
import { AppError } from "./errors.ts";
import {
  MAX_ACTIVE_MS,
  type Annotation,
  type AnnotationKind,
  type AnnotationSeverity,
  type AnnotationStatus,
  type Review,
} from "./review.ts";

const kinds = new Set<AnnotationKind>(["issue", "question", "suggestion", "decision", "note"]);
const severities = new Set<AnnotationSeverity>(["blocker", "major", "minor", "note"]);
const statuses = new Set<AnnotationStatus>(["open", "resolved"]);
const MAX_STORED_ANNOTATIONS = 5_000;
const MAX_STORED_TEXT_BYTES = 8 * 1024 * 1024;

export function parseStoredReview(value: unknown): Review {
  const record = object(value, "review");
  const documentPath = string(record.documentPath, "documentPath");
  if (!isAbsolute(documentPath) || resolve(documentPath) !== documentPath) invalid("documentPath must be canonical");
  const documentDigest = string(record.documentDigest, "documentDigest");
  if (!/^[a-f0-9]{64}$/.test(documentDigest)) invalid("documentDigest is invalid");
  const summary = string(record.summary, "summary", true);
  byteLimit(summary, MAX_STORED_TEXT_BYTES, "summary");
  if (!Array.isArray(record.annotations)) invalid("annotations must be an array");
  if (record.annotations.length > MAX_STORED_ANNOTATIONS) invalid("annotations exceed the storage limit");
  const seen = new Set<string>();
  const annotations = record.annotations.map((item) => parseAnnotation(item, seen));
  return {
    documentPath,
    documentDigest,
    revision: optionalInteger(record.revision, "revision", 0, Number.MAX_SAFE_INTEGER),
    summary,
    annotations,
    createdAt: string(record.createdAt, "createdAt"),
    updatedAt: string(record.updatedAt, "updatedAt"),
    metrics: parseMetrics(record.metrics),
  };
}

function parseAnnotation(value: unknown, seen: Set<string>): Annotation {
  const record = object(value, "annotation");
  const id = string(record.id, "annotation.id");
  byteLimit(id, MAX_STORED_TEXT_BYTES, "annotation.id");
  if (seen.has(id)) invalid("annotation ids must be unique");
  seen.add(id);
  const lineStart = integer(record.lineStart, "annotation.lineStart", 1, Number.MAX_SAFE_INTEGER);
  const lineEnd = integer(record.lineEnd, "annotation.lineEnd", lineStart, Number.MAX_SAFE_INTEGER);
  const note = string(record.note, "annotation.note");
  const agentAction = record.agentAction === undefined ? "" : string(record.agentAction, "annotation.agentAction", true);
  const section = nullableString(record.section, "annotation.section");
  const selectedText = nullableString(record.selectedText, "annotation.selectedText");
  const anchorText = nullableString(record.anchorText, "annotation.anchorText");
  byteLimit(note, MAX_STORED_TEXT_BYTES, "annotation.note");
  byteLimit(agentAction, MAX_STORED_TEXT_BYTES, "annotation.agentAction");
  if (section != null) byteLimit(section, MAX_STORED_TEXT_BYTES, "annotation.section");
  if (selectedText != null) byteLimit(selectedText, MAX_STORED_TEXT_BYTES, "annotation.selectedText");
  if (anchorText != null) byteLimit(anchorText, MAX_STORED_TEXT_BYTES, "annotation.anchorText");
  return {
    id,
    lineStart,
    lineEnd,
    section,
    selectedText,
    kind: enumValue(record.kind, kinds, "annotation.kind"),
    severity: enumValue(record.severity, severities, "annotation.severity"),
    status: enumValue(record.status, statuses, "annotation.status"),
    note,
    agentAction,
    createdAt: string(record.createdAt, "annotation.createdAt"),
    updatedAt: string(record.updatedAt, "annotation.updatedAt"),
    anchorText,
  };
}

function parseMetrics(value: unknown): { activeMs: number } {
  if (value === undefined) return { activeMs: 0 };
  const record = object(value, "metrics");
  return { activeMs: integer(record.activeMs, "metrics.activeMs", 0, MAX_ACTIVE_MS) };
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) invalid(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) invalid(`${field} must be a string`);
  return value as string;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  return string(value, field, true);
}

function integer(value: unknown, field: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    invalid(`${field} must be an integer in range`);
  }
  return value as number;
}

function optionalInteger(value: unknown, field: string, minimum: number, maximum: number): number {
  return value === undefined ? minimum : integer(value, field, minimum, maximum);
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>, field: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) invalid(`${field} is invalid`);
  return value as T;
}

function byteLimit(value: string, limit: number, field: string): void {
  if (Buffer.byteLength(value, "utf8") > limit) invalid(`${field} is too large`);
}

function invalid(message: string): never {
  throw new AppError("review_store_corrupt", 500, message);
}
