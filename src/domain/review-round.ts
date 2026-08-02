import type { Annotation, Review } from "./review.ts";

export const MAX_ROUNDS_PER_DOCUMENT = 100;
export const MAX_STORED_ROUND_BYTES = 32 * 1024 * 1024;
export const ROUND_ID_PATTERN = /^(\d{13})-([a-f0-9]{32})$/;

export interface ReviewRound {
  schemaVersion: 1;
  id: string;
  documentPath: string;
  documentDigest: string;
  reviewDigest: string;
  sourceText: string;
  revision: number;
  summary: string;
  annotations: Annotation[];
  activeMs: number;
  completedAt: string;
}

export interface RoundIdentity {
  id: string;
  completedAt: string;
}

export type RoundBaseline =
  | { state: "none"; reason: "no-baseline" | "immutable-upload" }
  | { state: "unavailable"; reason: "baseline-unavailable" }
  | { state: "ready"; round: ReviewRound };

export function createReviewRound(
  identity: RoundIdentity,
  sourceText: string,
  sourceDigest: string,
  review: Review,
): ReviewRound {
  return {
    schemaVersion: 1,
    id: identity.id,
    documentPath: review.documentPath,
    documentDigest: sourceDigest,
    reviewDigest: review.documentDigest,
    sourceText,
    revision: review.revision,
    summary: review.summary,
    annotations: review.annotations.map(persistedAnnotation),
    activeMs: review.metrics.activeMs,
    completedAt: identity.completedAt,
  };
}

export function reviewFromRound(round: ReviewRound): Review {
  return {
    documentPath: round.documentPath,
    documentDigest: round.reviewDigest,
    revision: round.revision,
    summary: round.summary,
    annotations: round.annotations,
    createdAt: round.completedAt,
    updatedAt: round.completedAt,
    metrics: { activeMs: round.activeMs },
  };
}

function persistedAnnotation(annotation: Annotation): Annotation {
  return {
    id: annotation.id,
    lineStart: annotation.lineStart,
    lineEnd: annotation.lineEnd,
    section: annotation.section,
    selectedText: annotation.selectedText,
    kind: annotation.kind,
    severity: annotation.severity,
    status: annotation.status,
    note: annotation.note,
    agentAction: annotation.agentAction,
    createdAt: annotation.createdAt,
    updatedAt: annotation.updatedAt,
    anchorText: annotation.anchorText,
  };
}
