import { AppError } from "../domain/errors.ts";
import {
  MAX_ANNOTATION_SPAN,
  MAX_TEXT_BYTES,
  MAX_TOTAL_ANNOTATION_SPAN,
  type Annotation,
  type Review,
} from "../domain/review.ts";

export function assertBaseRevision(value: unknown, expected: number): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new AppError("invalid_review", 400, "baseRevision must be a non-negative integer");
  }
  if (value !== expected) throw new AppError("review_conflict", 409, "Review changed; reload before saving");
}

export function assertDraftRangeBounds(value: unknown, previous: Review | null, lineCount: number): void {
  if (!Array.isArray(value)) return;
  const previousById = new Map(previous?.annotations.map((annotation) => [annotation.id, annotation]) ?? []);
  const previousSpan = previous?.annotations.reduce((total, item) => total + item.lineEnd - item.lineStart + 1, 0) ?? 0;
  let totalSpan = 0;
  let legacyReduction = previousSpan > MAX_TOTAL_ANNOTATION_SPAN;
  for (const valueItem of value) {
    if (valueItem == null || typeof valueItem !== "object" || Array.isArray(valueItem)) {
      legacyReduction = false;
      continue;
    }
    const item = valueItem as Record<string, unknown>;
    if (typeof item.lineStart !== "number" || !Number.isInteger(item.lineStart)) continue;
    const lineEnd = item.lineEnd == null ? item.lineStart : item.lineEnd;
    if (typeof lineEnd !== "number" || !Number.isInteger(lineEnd)) continue;
    const span = lineEnd - item.lineStart + 1;
    totalSpan += span;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (id !== "" && sameSavedRange(previousById.get(id), { lineStart: item.lineStart, lineEnd })) continue;
    legacyReduction = false;
    if (lineEnd > lineCount) throw new AppError("invalid_review", 400, "annotation range exceeds the document");
    if (span > MAX_ANNOTATION_SPAN) throw new AppError("invalid_review", 400, "annotation range is too large");
  }
  if (totalSpan > MAX_TOTAL_ANNOTATION_SPAN && !(legacyReduction && totalSpan < previousSpan)) {
    if (previousSpan > MAX_TOTAL_ANNOTATION_SPAN) {
      throw new AppError("invalid_review", 400, "legacy review exceeds the total span limit; delete annotations or reduce their ranges before editing other fields");
    }
    throw new AppError("invalid_review", 400, "annotation ranges exceed the total span limit");
  }
}

export function assertDerivedAnchors(review: Review, previous: Review | null): void {
  const previousById = new Map(previous?.annotations.map((annotation) => [annotation.id, annotation]) ?? []);
  for (const annotation of review.annotations) {
    if (sameSavedRange(previousById.get(annotation.id), annotation)) continue;
    if (annotation.anchorText == null) {
      throw new AppError("invalid_review", 400, "annotation range must contain non-blank source text");
    }
    if (Buffer.byteLength(annotation.anchorText, "utf8") > MAX_TEXT_BYTES) {
      throw new AppError("invalid_review", 400, "annotation anchor is too large");
    }
  }
}

export function isContentRejection(error: unknown): error is AppError {
  return error instanceof AppError && (error.code === "invalid_review" || error.code === "review_conflict");
}

export function sameSavedRange(
  previous: Annotation | undefined,
  next: Pick<Annotation, "lineStart" | "lineEnd">,
): boolean {
  return previous != null && previous.lineStart === next.lineStart && previous.lineEnd === next.lineEnd;
}
