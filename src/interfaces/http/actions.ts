export interface ReviewRequestDraft {
  path: string;
  summary?: unknown;
  annotations: unknown[];
  activeMsDelta?: unknown;
}

export function readReviewDraft(value: unknown): ReviewRequestDraft {
  const record = requestRecord(value);
  const path = requiredPath(record.path);
  if ("summary" in record && typeof record.summary !== "string") {
    throw new Error("summary must be a string");
  }
  if (!Array.isArray(record.annotations)) {
    throw new Error("annotations must be an array");
  }
  return { path, summary: record.summary, annotations: record.annotations, activeMsDelta: record.activeMsDelta };
}

export function readSessionAction(value: unknown): { path: string; reason: string | null; activeMsDelta?: unknown } {
  const record = requestRecord(value);
  const reason = typeof record.reason === "string" && record.reason.trim() !== "" ? record.reason.trim() : null;
  return { path: requiredPath(record.path), reason, activeMsDelta: record.activeMsDelta };
}

export function readActiveTime(value: unknown): { path: string; activeMsDelta: unknown } {
  const record = requestRecord(value);
  return { path: requiredPath(record.path), activeMsDelta: record.activeMsDelta };
}

export function readPathAction(value: unknown): { path: string } {
  return { path: requiredPath(requestRecord(value).path) };
}

function requestRecord(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("request body must be an object");
  }
  return value as Record<string, unknown>;
}

function requiredPath(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error("path is required");
  return value;
}
