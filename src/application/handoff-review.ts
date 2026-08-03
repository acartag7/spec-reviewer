import { AppError } from "../domain/errors.ts";
import { createEmptyReview } from "../domain/review.ts";
import { createReviewRound, type ReviewRound } from "../domain/review-round.ts";
import type { DocumentReader, ReviewStore } from "./ports.ts";
import type { ReviewRoundStore } from "./round-ports.ts";
import { assertBaseRevision } from "./review-validation.ts";
import { exportRound, type ReviewExportResult } from "./terminal-review.ts";

const IDEMPOTENCY_KEY_PATTERN = /^[a-f0-9]{32}$/;
const DOCUMENT_DIGEST_PATTERN = /^[a-f0-9]{64}$/;

export interface HandoffAction {
  baseRevision: unknown;
  documentDigest: unknown;
  idempotencyKey: unknown;
}

export interface ReviewHandoffResult extends ReviewExportResult {
  checkpoint: { id: string; trigger: "handoff"; capturedAt: string } | null;
}

export async function handoffReview(
  reader: DocumentReader,
  store: ReviewStore,
  rounds: ReviewRoundStore,
  path: string,
  action: HandoffAction,
): Promise<ReviewHandoffResult> {
  const idempotencyKey = readIdempotencyKey(action.idempotencyKey);
  const documentDigest = readDocumentDigest(action.documentDigest);
  const baseRevision = readBaseRevision(action.baseRevision);
  const requestedId = roundIdFor(idempotencyKey, Date.now());
  const existing = await rounds.loadCommitted(path, requestedId);
  if (existing != null) return resultFromRound(assertHandoffRetry(existing, documentDigest, baseRevision));

  const { document, content } = await reader.readMarkdown(path);
  if (document.digest !== documentDigest) {
    throw new AppError("review_conflict", 409, "Document changed; reload before copying feedback");
  }
  const review = await store.load(document.path) ?? createEmptyReview(document.path, document.digest);
  assertBaseRevision(baseRevision, review.revision);
  const round = createReviewRound(
    { id: requestedId, completedAt: new Date(Number(requestedId.slice(0, 13))).toISOString(), trigger: "handoff" },
    content,
    document.digest,
    review,
  );
  const committed = await rounds.commit(round);
  if (committed == null) {
    return { ...exportRound(round), checkpoint: null };
  }
  return resultFromRound(assertHandoffRetry(committed, documentDigest, baseRevision));
}

function readIdempotencyKey(value: unknown): string {
  if (typeof value !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new AppError("invalid_request", 400, "idempotencyKey must be 32 lowercase hexadecimal characters");
  }
  return value;
}

function readDocumentDigest(value: unknown): string {
  if (typeof value !== "string" || !DOCUMENT_DIGEST_PATTERN.test(value)) {
    throw new AppError("invalid_request", 400, "documentDigest must be a SHA-256 digest");
  }
  return value;
}

function readBaseRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new AppError("invalid_review", 400, "baseRevision must be a non-negative integer");
  }
  return value;
}

function roundIdFor(idempotencyKey: string, now: number): string {
  return `${String(now).padStart(13, "0")}-${idempotencyKey}`;
}

function resultFromRound(round: ReviewRound): ReviewHandoffResult {
  return {
    ...exportRound(round),
    checkpoint: { id: round.id, trigger: "handoff", capturedAt: round.completedAt },
  };
}

function assertHandoffRetry(round: ReviewRound, documentDigest: string, baseRevision: number): ReviewRound {
  if (round.trigger !== "handoff") {
    throw new AppError("review_conflict", 409, "Feedback checkpoint key conflicts with a completed review");
  }
  if (round.documentDigest !== documentDigest || round.revision !== baseRevision) {
    throw new AppError("review_conflict", 409, "Feedback checkpoint retry does not match the original document and review");
  }
  return round;
}
