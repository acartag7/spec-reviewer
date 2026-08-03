import { sectionForLine } from "../domain/document.ts";
import { AppError, isErrno } from "../domain/errors.ts";
import {
  createEmptyReview,
  normalizeMetrics,
  normalizeReviewDraft,
  sourceTextForLines,
  withResolvedAnchors,
  type Review,
  type ReviewDraft,
} from "../domain/review.ts";
import type { ReviewComparison } from "../domain/review-comparison.ts";
import { exportReviewMarkdown, reviewExportCounts } from "./export-review.ts";
import { buildReviewComparison } from "./review-comparison.ts";
import {
  assertBaseRevision,
  assertDerivedAnchors,
  assertDraftRangeBounds,
  isContentRejection,
  sameSavedRange,
} from "./review-validation.ts";
import type { DocumentReader, RecentReview, ReviewSourceState, ReviewStore } from "./ports.ts";
import type { ReviewRoundStore } from "./round-ports.ts";
import type { TerminalAttempt } from "./review-session.ts";
import { handoffReview, type HandoffAction } from "./handoff-review.ts";
import { cancelTerminalReview, finishTerminalReview } from "./terminal-review.ts";

export interface OpenDocumentResult {
  document: Awaited<ReturnType<DocumentReader["readMarkdown"]>>["document"];
  review: Review;
  stale: boolean;
  sourceState: ReviewSourceState;
  comparison: ReviewComparison;
}

export class ReviewerService {
  private readonly reader: DocumentReader;
  private readonly store: ReviewStore;
  private readonly rounds: ReviewRoundStore;

  constructor(reader: DocumentReader, store: ReviewStore, rounds: ReviewRoundStore) {
    this.reader = reader;
    this.store = store;
    this.rounds = rounds;
  }

  resolveDocumentPath(path: string): string {
    return this.reader.resolvePath(path);
  }

  private readonly locks = new Map<string, Promise<void>>();

  // Serialize load→modify→save per document path so a passive active-time flush cannot replace newer
  // content from a stale snapshot. Atomic files prevent torn storage; this lock prevents in-process
  // lost updates. The entry self-cleans once the promise chain drains.
  private synchronized<T>(path: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(path) ?? Promise.resolve();
    const result = previous.then(fn, fn);
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    this.locks.set(path, settled);
    settled.finally(() => {
      if (this.locks.get(path) === settled) this.locks.delete(path);
    });
    return result;
  }

  async openDocument(path: string): Promise<OpenDocumentResult> {
    const { document, content } = await this.reader.readMarkdown(path);
    const stored = await this.store.load(document.path);
    const baseline = await this.rounds.loadLatest(document.path);
    const comparison = baseline.state === "ready"
      ? buildReviewComparison(baseline.round, content, document.digest)
      : { state: "unavailable" as const, reason: baseline.reason };
    if (stored == null) {
      return {
        document,
        review: withResolvedAnchors(document, createEmptyReview(document.path, document.digest)),
        stale: false,
        sourceState: "unreviewed",
        comparison,
      };
    }
    const stale = stored.documentDigest !== document.digest;
    return {
      document,
      review: withResolvedAnchors(document, stored),
      stale,
      sourceState: stale ? "changed" : "current",
      comparison,
    };
  }

  async documentPathForSession(id: string): Promise<string> {
    const review = await this.store.loadById(id);
    if (review == null) throw new AppError("not_found", 404, "Session not found");
    return review.documentPath;
  }

  async saveReview(draft: ReviewDraft): Promise<Review> {
    const path = this.reader.resolvePath(draft.path);
    return this.synchronized(path, async () => {
      const { document } = await this.reader.readMarkdown(path);
      const previous = await this.store.load(document.path);
      const contentChange = draft.summary !== undefined || draft.annotations !== undefined;
      const stored = previous ?? createEmptyReview(document.path, document.digest);
      const metrics = normalizeMetrics(stored.metrics, draft.activeMsDelta);
      if (!contentChange) {
        const updated = { ...stored, metrics };
        if (updated.metrics.activeMs !== stored.metrics.activeMs) await this.store.save(updated);
        return withResolvedAnchors(document, updated);
      }
      try {
        assertBaseRevision(draft.baseRevision, previous?.revision ?? 0);
        assertDraftRangeBounds(draft.annotations, previous, document.lines.length);
        const previousAnchors = new Map(previous?.annotations.map((item) => [item.id, item]) ?? []);
        const digest = previous != null && previous.documentDigest !== document.digest
          ? previous.documentDigest
          : document.digest;
        const review = normalizeReviewDraft(
          { ...draft, activeMsDelta: undefined, path: document.path },
          digest,
          (line) => sectionForLine(document, line),
          (annotation) => {
            const previousAnchor = previousAnchors.get(annotation.id);
            if (previousAnchor != null && sameSavedRange(previousAnchor, annotation)) return previousAnchor.anchorText;
            return sourceTextForLines(document, annotation.lineStart, annotation.lineEnd);
          },
          previous,
        );
        assertDerivedAnchors(review, previous);
        review.metrics = metrics;
        review.revision = (previous?.revision ?? 0) + 1;
        await this.store.save(review);
        return withResolvedAnchors(document, review);
      } catch (error) {
        if (isContentRejection(error) && metrics.activeMs !== stored.metrics.activeMs) {
          try {
            await this.store.save({ ...stored, metrics });
          } catch (storageError) {
            const storageCode = storageError instanceof AppError ? storageError.code : "internal_error";
            throw new AppError(
              "review_rejected_metrics_persist_failed",
              500,
              `${error.message}; active time storage could not be confirmed`,
              { rejection: error.code, storage: storageCode },
            );
          }
        }
        throw error;
      }
    });
  }

  async exportReview(path: string): Promise<{ markdown: string; openAnnotations: number; carriedOver: number; activeMs: number }> {
    const resolvedPath = this.reader.resolvePath(path);
    return this.synchronized(resolvedPath, async () => this.exportLocked(resolvedPath));
  }

  async handoffReview(path: string, action: HandoffAction) {
    const resolvedPath = this.reader.resolvePath(path);
    return this.synchronized(resolvedPath, async () => handoffReview(this.reader, this.store, this.rounds, resolvedPath, action));
  }

  async finishReview(path: string, terminal: TerminalAttempt) {
    const resolvedPath = this.reader.resolvePath(path);
    return this.synchronized(resolvedPath, async () => {
      return finishTerminalReview(this.reader, this.store, this.rounds, resolvedPath, terminal);
    });
  }

  async cancelReview(path: string, terminal: TerminalAttempt): Promise<number> {
    const resolvedPath = this.reader.resolvePath(path);
    return this.synchronized(resolvedPath, async () => cancelTerminalReview(this.store, resolvedPath, terminal));
  }

  // Accumulate active-reviewing time WITHOUT touching annotations, summary, or timestamps. Used by the
  // finish/cancel flush path and the passive /api/active-time flush, whose bodies carry only a delta.
  // If no review is stored yet (a read-only session that never saved feedback), one is created so a
  // reviewer who only reads and finishes still records their active time. Serialized per path.
  async addActiveTime(path: string, delta: unknown): Promise<Review> {
    const resolvedPath = this.reader.resolvePath(path);
    return this.synchronized(resolvedPath, async () => {
      const { document } = await this.reader.readMarkdown(resolvedPath);
      const stored = await this.store.load(document.path) ?? createEmptyReview(document.path, document.digest);
      const updated: Review = { ...stored, metrics: normalizeMetrics(stored.metrics, delta) };
      if (updated.metrics.activeMs !== stored.metrics.activeMs) await this.store.save(updated);
      return withResolvedAnchors(document, updated);
    });
  }

  async listRecentReviews(limit = 20): Promise<RecentReview[]> {
    const stored = await this.store.listRecent(limit);
    return Promise.all(stored.map(async (review) => {
      try {
        const { document } = await this.reader.readMarkdown(review.documentPath);
        return {
          ...review,
          sourceState: document.digest === review.documentDigest ? "current" : "changed",
          currentDigest: document.digest,
        };
      } catch (error) {
        if (isErrno(error, "ENOENT")) return { ...review, sourceState: "missing", currentDigest: null };
        throw error;
      }
    }));
  }

  private async exportLocked(path: string) {
    const { document } = await this.reader.readMarkdown(path);
    const review = await this.store.load(document.path) ?? createEmptyReview(document.path, document.digest);
    return exportResult(document, withResolvedAnchors(document, review));
  }
}

function exportResult(
  document: OpenDocumentResult["document"],
  review: Review,
): { markdown: string; openAnnotations: number; carriedOver: number; activeMs: number } {
  return {
    markdown: exportReviewMarkdown(document, review),
    ...reviewExportCounts(document, review),
    activeMs: review.metrics.activeMs,
  };
}
