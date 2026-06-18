import type { ReviewDocument } from "../domain/document.ts";
import type { Review } from "../domain/review.ts";

export type ReviewSourceState = "unreviewed" | "current" | "changed" | "missing";

export interface StoredReviewSummary {
  id: string;
  documentPath: string;
  title: string;
  documentDigest: string;
  annotations: number;
  openAnnotations: number;
  updatedAt: string;
  activeMs: number;
}

export interface RecentReview extends StoredReviewSummary {
  sourceState: ReviewSourceState;
  currentDigest: string | null;
}

export interface DocumentReader {
  readMarkdown(path: string): Promise<{ document: ReviewDocument; content: string }>;
}

export interface ReviewStore {
  load(documentPath: string): Promise<Review | null>;
  loadById(id: string): Promise<Review | null>;
  save(review: Review): Promise<void>;
  listRecent(limit: number): Promise<StoredReviewSummary[]>;
}
