import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { pathKey } from "../domain/ids.ts";
import type { Review } from "../domain/review.ts";
import type { ReviewStore, StoredReviewSummary } from "../application/ports.ts";

export class JsonReviewStore implements ReviewStore {
  private readonly storageDir: string;

  constructor(storageDir: string) {
    this.storageDir = storageDir;
  }

  async load(documentPath: string): Promise<Review | null> {
    try {
      const raw = await readFile(this.filePath(documentPath), "utf8");
      return JSON.parse(raw) as Review;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async save(review: Review): Promise<void> {
    await mkdir(this.reviewDir(), { recursive: true, mode: 0o700 });
    await writeFile(this.filePath(review.documentPath), `${JSON.stringify(review, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  async listRecent(limit: number): Promise<StoredReviewSummary[]> {
    let entries: string[];
    try {
      entries = await readdir(this.reviewDir());
    } catch (error) {
      if (isNotFound(error)) return [];
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
      const review = JSON.parse(await readFile(join(this.reviewDir(), entry), "utf8")) as Review;
      return {
        documentPath: review.documentPath,
        title: basename(review.documentPath),
        documentDigest: review.documentDigest,
        annotations: review.annotations.length,
        openAnnotations: review.annotations.filter((item) => item.status === "open").length,
        updatedAt: review.updatedAt,
      };
    } catch {
      return null;
    }
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error != null && "code" in error && error.code === "ENOENT";
}
