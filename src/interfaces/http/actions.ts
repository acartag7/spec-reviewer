import type { ReviewDraft } from "../../domain/review.ts";
import { AppError } from "../../domain/errors.ts";

export function readReviewDraft(value: unknown): ReviewDraft {
  const record = objectBody(value);
  return {
    path: requiredPath(record.path),
    baseRevision: record.baseRevision,
    summary: record.summary,
    annotations: record.annotations,
    activeMsDelta: record.activeMsDelta,
  };
}

export function readSessionAction(value: unknown): { path: string; reason: string | null; activeMsDelta?: unknown } {
  const record = objectBody(value);
  if (record.reason !== undefined && record.reason !== null && typeof record.reason !== "string") {
    throw new AppError("invalid_request", 400, "reason must be a string or null");
  }
  const reason = typeof record.reason === "string" && record.reason.trim() !== "" ? record.reason.trim() : null;
  return { path: requiredPath(record.path), reason, activeMsDelta: record.activeMsDelta };
}

export function readActiveTime(value: unknown): { path: string; activeMsDelta: unknown } {
  const record = objectBody(value);
  return { path: requiredPath(record.path), activeMsDelta: record.activeMsDelta };
}

function objectBody(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("invalid_request", 400, "request body must be an object");
  }
  return value as Record<string, unknown>;
}

function requiredPath(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AppError("invalid_request", 400, "path is required");
  }
  return value;
}
