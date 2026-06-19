import { sectionForLine } from "../domain/document.ts";
import {
  createEmptyReview,
  normalizeMetrics,
  normalizeReviewDraft,
  sourceTextForLines,
  withResolvedAnchors,
  type Annotation,
  type Review,
  type ReviewDraft,
} from "../domain/review.ts";
import { exportReviewMarkdown, reviewExportCounts } from "./export-review.ts";
import type { DocumentReader, RecentReview, ReviewSourceState, ReviewStore } from "./ports.ts";

export interface OpenDocumentResult {
  document: Awaited<ReturnType<DocumentReader["readMarkdown"]>>["document"];
  review: Review;
  stale: boolean;
  sourceState: ReviewSourceState;
}

export class ReviewerService {
  private readonly reader: DocumentReader;
  private readonly store: ReviewStore;

  constructor(reader: DocumentReader, store: ReviewStore) {
    this.reader = reader;
    this.store = store;
  }

  private readonly locks = new Map<string, Promise<void>>();

  // Serialize load→modify→save per document path. The JSON store has no atomicity, so without this an
  // active-time flush (addActiveTime) racing a saveReview could load a stale snapshot and write it back,
  // reverting the user's latest annotations — last write wins. Single-process local server, so an
  // in-memory promise chain per path is sufficient; the entry self-cleans once the chain drains.
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
    const { document } = await this.reader.readMarkdown(path);
    const stored = await this.store.load(document.path);
    if (stored == null) {
      return {
        document,
        review: withResolvedAnchors(document, createEmptyReview(document.path, document.digest)),
        stale: false,
        sourceState: "unreviewed",
      };
    }
    const stale = stored.documentDigest !== document.digest;
    return { document, review: withResolvedAnchors(document, stored), stale, sourceState: stale ? "changed" : "current" };
  }

  async documentPathForSession(id: string): Promise<string> {
    const review = await this.store.loadById(id);
    if (review == null) throw new Error("session not found");
    return review.documentPath;
  }

  async saveReview(draft: ReviewDraft): Promise<Review> {
    const { document } = await this.reader.readMarkdown(draft.path);
    return this.synchronized(document.path, async () => {
      const previous = await this.store.load(document.path);
      const previousAnchors = new Map(previous?.annotations.map((item) => [item.id, item]) ?? []);
      const digest = previous != null && previous.documentDigest !== document.digest
        ? previous.documentDigest
        : document.digest;
      const review = normalizeReviewDraft(
        { ...draft, path: document.path },
        digest,
        (line) => sectionForLine(document, line),
        (annotation) => {
          const previousAnchor = previousAnchors.get(annotation.id);
          if (
            previousAnchor != null
            && sameSavedRange(previousAnchor, annotation)
            && previousAnchor.anchorText != null
          ) {
            return previousAnchor.anchorText;
          }
          return sourceTextForLines(document, annotation.lineStart, annotation.lineEnd);
        },
        previous,
      );
      if (previous != null) review.createdAt = previous.createdAt;
      await this.store.save(review);
      return withResolvedAnchors(document, review);
    });
  }

  async exportReview(path: string): Promise<{ markdown: string; openAnnotations: number; carriedOver: number; activeMs: number }> {
    const { document } = await this.reader.readMarkdown(path);
    const review = await this.store.load(document.path) ?? createEmptyReview(document.path, document.digest);
    const resolved = withResolvedAnchors(document, review);
    return {
      markdown: exportReviewMarkdown(document, resolved),
      ...reviewExportCounts(document, resolved),
      activeMs: review.metrics?.activeMs ?? 0,
    };
  }

  // Accumulate active-reviewing time WITHOUT touching annotations, summary, or timestamps. Used by the
  // finish/cancel flush path and the passive /api/active-time flush, whose bodies carry only a delta.
  // If no review is stored yet (a read-only session that never saved feedback), one is created so a
  // reviewer who only reads and finishes still records their active time. Serialized per path.
  async addActiveTime(path: string, delta: unknown): Promise<Review> {
    const { document } = await this.reader.readMarkdown(path);
    return this.synchronized(document.path, async () => {
      const stored = await this.store.load(document.path) ?? createEmptyReview(document.path, document.digest);
      const updated: Review = { ...stored, metrics: normalizeMetrics(stored.metrics, delta) };
      await this.store.save(updated);
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
      } catch {
        return { ...review, sourceState: "missing", currentDigest: null };
      }
    }));
  }
}

function sameSavedRange(
  previous: Annotation | undefined,
  next: Pick<Annotation, "lineStart" | "lineEnd">,
): boolean {
  return previous != null && previous.lineStart === next.lineStart && previous.lineEnd === next.lineEnd;
}
