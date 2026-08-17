import { basename, join } from "node:path";
import { assertReviewablePath, assertReviewableText } from "../../domain/document-format.ts";
import { contentDigest } from "../../domain/ids.ts";
import { AppError } from "../../domain/errors.ts";
import { atomicWritePrivateFile } from "../../infrastructure/atomic-file.ts";

const maxUploadBytes = 2 * 1024 * 1024;

export async function storeUploadedMarkdown(storageDir: string, name: string, content: string): Promise<string> {
  const safeName = sanitizeName(name);
  assertReviewablePath(safeName, "dropped");
  assertReviewableText(content);
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > maxUploadBytes) throw new AppError("invalid_request", 400, "Document is too large");
  const digest = contentDigest(content).slice(0, 16);
  const dir = join(storageDir, "documents");
  const path = join(dir, `${digest}-${safeName}`);
  await atomicWritePrivateFile(dir, path, content);
  return path;
}

export function readUpload(value: unknown): { name: string; content: string } {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("invalid_request", 400, "request body must be an object");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.name !== "string" || record.name.trim() === "") throw new AppError("invalid_request", 400, "name is required");
  if (typeof record.content !== "string") throw new AppError("invalid_request", 400, "content is required");
  return { name: record.name, content: record.content };
}

function sanitizeName(name: string): string {
  return basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
}
