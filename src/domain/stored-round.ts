import { contentDigest } from "./ids.ts";
import { AppError } from "./errors.ts";
import { MAX_ACTIVE_MS } from "./review.ts";
import { parseStoredReview } from "./stored-review.ts";
import { ROUND_ID_PATTERN, type ReviewRound } from "./review-round.ts";

const MAX_ROUND_SOURCE_BYTES = 6 * 1024 * 1024;

export function parseStoredRound(value: unknown): ReviewRound {
  try {
    const record = object(value);
    if (record.schemaVersion !== 1) invalid();
    const id = string(record.id);
    const match = ROUND_ID_PATTERN.exec(id);
    if (match == null) invalid();
    const completedAt = string(record.completedAt);
    assertTimestampBinding(match[1] ?? "", completedAt);
    const sourceText = string(record.sourceText, true);
    if (Buffer.byteLength(sourceText, "utf8") > MAX_ROUND_SOURCE_BYTES) invalid();
    const activeMs = integer(record.activeMs, 0, MAX_ACTIVE_MS);
    const review = parseStoredReview({
      documentPath: record.documentPath,
      documentDigest: record.reviewDigest,
      revision: record.revision,
      summary: record.summary,
      annotations: record.annotations,
      createdAt: completedAt,
      updatedAt: completedAt,
      metrics: { activeMs },
    });
    const documentDigest = string(record.documentDigest);
    if (!/^[a-f0-9]{64}$/.test(documentDigest) || contentDigest(sourceText) !== documentDigest) invalid();
    return {
      schemaVersion: 1,
      id,
      documentPath: review.documentPath,
      documentDigest,
      reviewDigest: review.documentDigest,
      sourceText,
      revision: review.revision,
      summary: review.summary,
      annotations: review.annotations,
      activeMs,
      completedAt,
    };
  } catch (error) {
    if (error instanceof AppError && error.code === "round_store_corrupt") throw error;
    invalid();
  }
}

function assertTimestampBinding(epochText: string, completedAt: string): void {
  const epoch = Number(epochText);
  if (!Number.isSafeInteger(epoch) || epoch < 1) invalid();
  let expected: string;
  try {
    expected = new Date(epoch).toISOString();
  } catch {
    invalid();
  }
  if (expected !== completedAt) invalid();
}

function object(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function string(value: unknown, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) invalid();
  return value as string;
}

function integer(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) invalid();
  return value;
}

function invalid(): never {
  throw new AppError("round_store_corrupt", 500, "Stored review round is malformed");
}
