import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { pathKey } from "../domain/ids.ts";
import { AppError, isErrno } from "../domain/errors.ts";
import type { Review } from "../domain/review.ts";
import { parseStoredReview } from "../domain/stored-review.ts";
import type { ReviewStore, StoredReviewSummary } from "../application/ports.ts";
import { atomicWritePrivateFile } from "./atomic-file.ts";

const MAX_STORED_REVIEW_BYTES = 16 * 1024 * 1024;

export class JsonReviewStore implements ReviewStore {
  private readonly storageDir: string;

  constructor(storageDir: string) {
    this.storageDir = storageDir;
  }

  async load(documentPath: string): Promise<Review | null> {
    try {
      return await this.readStored(`${pathKey(documentPath)}.json`, documentPath);
    } catch (error) {
      if (isErrno(error, "ENOENT")) return null;
      throw error;
    }
  }

  async loadById(id: string): Promise<Review | null> {
    if (!/^[a-f0-9]{32}$/.test(id)) throw new AppError("invalid_request", 400, "session id is invalid");
    try {
      return await this.readStored(`${id}.json`);
    } catch (error) {
      if (isErrno(error, "ENOENT")) return null;
      throw error;
    }
  }

  async save(review: Review): Promise<void> {
    const validated = parseStoredReview(review);
    const content = `${JSON.stringify(validated, null, 2)}\n`;
    if (Buffer.byteLength(content, "utf8") > MAX_STORED_REVIEW_BYTES) {
      throw new AppError("review_store_corrupt", 500, "Review exceeds the storage limit");
    }
    await atomicWritePrivateFile(this.reviewDir(), this.filePath(validated.documentPath), content);
  }

  async listRecent(limit: number): Promise<StoredReviewSummary[]> {
    let entries: string[];
    try {
      entries = await readdir(this.reviewDir());
    } catch (error) {
      if (isErrno(error, "ENOENT")) return [];
      throw error;
    }
    const reviews = await Promise.all(entries.filter((entry) => entry.endsWith(".json")).map((entry) => this.readRecent(entry)));
    return reviews
      .filter((review): review is StoredReviewSummary => review != null)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit);
  }

  private reviewDir(): string {
    return join(this.storageDir, "reviews");
  }

  private filePath(documentPath: string): string {
    return join(this.reviewDir(), `${pathKey(documentPath)}.json`);
  }

  private async readRecent(entry: string): Promise<StoredReviewSummary | null> {
    try {
      const review = await this.readStored(entry);
      return {
        id: entry.replace(/\.json$/, ""),
        documentPath: review.documentPath,
        title: basename(review.documentPath),
        documentDigest: review.documentDigest,
        annotations: review.annotations.length,
        openAnnotations: review.annotations.filter((item) => item.status === "open").length,
        updatedAt: review.updatedAt,
        activeMs: review.metrics?.activeMs ?? 0,
      };
    } catch (error) {
      if (isErrno(error, "ENOENT")) return null;
      throw error;
    }
  }

  private async readStored(entry: string, expectedPath?: string): Promise<Review> {
    const raw = await readFile(join(this.reviewDir(), entry));
    let value: unknown;
    try {
      if (raw.byteLength > MAX_STORED_REVIEW_BYTES) throw corruptReview(entry);
      value = JSON.parse(raw.toString("utf8"));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw corruptReview(entry);
    }
    let review: Review;
    try {
      review = parseStoredReview(value);
    } catch {
      throw corruptReview(entry);
    }
    const id = entry.replace(/\.json$/, "");
    if (!/^[a-f0-9]{32}$/.test(id) || pathKey(review.documentPath) !== id) throw corruptReview(entry);
    if (expectedPath != null && review.documentPath !== expectedPath) throw corruptReview(entry);
    return review;
  }
}

function corruptReview(entry: string): AppError {
  const filename = basename(entry).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "unknown.json";
  return new AppError(
    "review_store_corrupt",
    500,
    "Stored review is malformed",
    { filename },
  );
}
