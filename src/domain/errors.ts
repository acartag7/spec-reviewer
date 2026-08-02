export type AppErrorCode =
  | "internal_error"
  | "invalid_json"
  | "invalid_request"
  | "invalid_review"
  | "not_found"
  | "review_rejected_metrics_persist_failed"
  | "review_conflict"
  | "review_store_corrupt"
  | "round_limit_reached"
  | "round_store_busy"
  | "round_store_corrupt"
  | "session_path_mismatch"
  | "storage_cleanup_failed"
  | "storage_commit_indeterminate"
  | "storage_path_unsafe"
  | "storage_write_failed";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details: Readonly<Record<string, string>>;

  constructor(code: AppErrorCode, status: number, message: string, details: Record<string, string> = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = Object.freeze({ ...details });
  }
}

export function invalidReview(message: string): AppError {
  return new AppError("invalid_review", 400, message);
}

export function isErrno(error: unknown, code: string): boolean {
  try {
    return typeof error === "object" && error != null && "code" in error && error.code === code;
  } catch {
    return false;
  }
}

export function publicError(error: unknown): {
  status: number;
  body: { error: { code: string; message: string; details?: Readonly<Record<string, string>> } };
} {
  if (error instanceof AppError) {
    const details = Object.keys(error.details).length === 0 ? undefined : error.details;
    return { status: error.status, body: { error: { code: error.code, message: error.message, details } } };
  }
  if (isErrno(error, "ENOENT")) {
    return { status: 404, body: { error: { code: "not_found", message: "File not found" } } };
  }
  return { status: 500, body: { error: { code: "internal_error", message: "Request failed" } } };
}
