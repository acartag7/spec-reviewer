import { extname } from "node:path";
import { AppError } from "./errors.ts";

export type ReviewDocumentFormat = "markdown" | "source";

const markdownExtensions = [".md", ".markdown"] as const;
// Spec-adjacent text only: YAML/JSON/TOML configs and plain-text plans.
// Not a generic code or artifact reviewer — no HTML, SVG, images, or source trees.
const sourceExtensions = [".yaml", ".yml", ".json", ".toml", ".txt"] as const;
const markdownExtensionSet = new Set<string>(markdownExtensions);
const sourceExtensionSet = new Set<string>(sourceExtensions);

export const reviewableExtensions = [...markdownExtensions, ...sourceExtensions];

export function reviewDocumentFormat(path: string): ReviewDocumentFormat | null {
  const extension = extname(path).toLowerCase();
  if (markdownExtensionSet.has(extension)) return "markdown";
  if (sourceExtensionSet.has(extension)) return "source";
  return null;
}

export function assertReviewablePath(path: string, verb: "reviewed" | "dropped" = "reviewed"): ReviewDocumentFormat {
  const format = reviewDocumentFormat(path);
  if (format == null) {
    throw new AppError("invalid_request", 400, `Only ${reviewableExtensions.join(", ")} files can be ${verb}`);
  }
  return format;
}

export function decodeReviewText(bytes: Uint8Array): string {
  if (bytes.includes(0)) throw binaryFileError();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw binaryFileError();
  }
}

export function assertReviewableText(content: string): void {
  if (content.includes("\0")) throw binaryFileError();
}

function binaryFileError(): AppError {
  return new AppError("invalid_request", 400, "Binary files cannot be reviewed");
}
