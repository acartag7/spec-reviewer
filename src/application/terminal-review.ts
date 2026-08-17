import { parseReviewDocument } from "../domain/document.ts";
import { AppError } from "../domain/errors.ts";
import {
  createEmptyReview,
  normalizeActiveMsDelta,
  normalizeMetrics,
  withResolvedAnchors,
  type Review,
} from "../domain/review.ts";
import { createReviewRound, reviewFromRound, type ReviewRound } from "../domain/review-round.ts";
import type { DocumentReader, ReviewStore } from "./ports.ts";
import type { ReviewRoundStore } from "./round-ports.ts";
import type { TerminalAttempt } from "./review-session.ts";
import { exportReviewMarkdown, reviewExportCounts } from "./export-review.ts";

export interface ReviewExportResult {
  markdown: string;
  openAnnotations: number;
  carriedOver: number;
  activeMs: number;
}

export async function finishTerminalReview(
  reader: DocumentReader,
  store: ReviewStore,
  rounds: ReviewRoundStore,
  path: string,
  terminal: TerminalAttempt,
): Promise<ReviewExportResult> {
  const committed = await rounds.loadCommitted(path, terminal.id);
  if (committed != null) {
    terminal.confirmActiveTime();
    return exportRound(committed);
  }
  const { document, content } = await reader.readMarkdown(path);
  const stored = await store.load(document.path) ?? createEmptyReview(document.path, document.digest);
  const updated = await persistTerminalMetrics(store, stored, terminal);
  const durable = await store.load(document.path) ?? updated;
  const round = createReviewRound(
    { id: terminal.id, completedAt: terminal.completedAt },
    content,
    document.digest,
    durable,
  );
  return exportRound(await rounds.commit(round) ?? round);
}

export async function cancelTerminalReview(
  store: ReviewStore,
  path: string,
  terminal: TerminalAttempt,
): Promise<number> {
  const stored = await store.load(path);
  if (stored == null) {
    const activeMs = normalizeActiveMsDelta(terminal.activeMsDelta);
    terminal.confirmActiveTime();
    return activeMs;
  }
  return (await persistTerminalMetrics(store, stored, terminal)).metrics.activeMs;
}

async function persistTerminalMetrics(
  store: ReviewStore,
  review: Review,
  terminal: TerminalAttempt,
): Promise<Review> {
  const metrics = normalizeMetrics(review.metrics, terminal.activeMsDelta);
  if (metrics.activeMs === review.metrics.activeMs) {
    terminal.confirmActiveTime();
    return review;
  }
  const expected = { ...review, metrics, updatedAt: new Date().toISOString() };
  try {
    await store.save(expected);
    terminal.confirmActiveTime();
    return expected;
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== "storage_commit_indeterminate") throw error;
    const reloaded = await store.load(review.documentPath);
    if (reloaded?.metrics.activeMs !== expected.metrics.activeMs || reloaded.updatedAt !== expected.updatedAt) throw error;
    terminal.confirmActiveTime();
    return reloaded;
  }
}

export function exportRound(round: ReviewRound): ReviewExportResult {
  const document = parseReviewDocument(round.documentPath, round.sourceText);
  const review = withResolvedAnchors(document, reviewFromRound(round));
  return {
    markdown: exportReviewMarkdown(document, review),
    ...reviewExportCounts(document, review),
    activeMs: round.activeMs,
  };
}
