import { sectionForLine } from "../domain/document.ts";
import {
  createEmptyReview,
  normalizeReviewDraft,
  sourceTextForLines,
  withResolvedAnchors,
  type Annotation,
  type Review,
  type ReviewDraft,
} from "../domain/review.ts";
import { exportReviewMarkdown } from "./export-review.ts";
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
    );
    if (previous != null) review.createdAt = previous.createdAt;
    await this.store.save(review);
    return withResolvedAnchors(document, review);
  }

  async exportReview(path: string): Promise<{ markdown: string }> {
    const { document } = await this.reader.readMarkdown(path);
    const review = await this.store.load(document.path) ?? createEmptyReview(document.path, document.digest);
    return { markdown: exportReviewMarkdown(document, withResolvedAnchors(document, review)) };
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
