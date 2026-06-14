import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { contentDigest } from "../../domain/ids.ts";

const maxUploadBytes = 2 * 1024 * 1024;
const allowedExtensions = new Set([".md", ".markdown"]);

export async function storeUploadedMarkdown(storageDir: string, name: string, content: string): Promise<string> {
  const safeName = sanitizeName(name);
  if (!allowedExtensions.has(extname(safeName).toLowerCase())) {
    throw new Error("Only .md and .markdown files can be dropped");
  }
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > maxUploadBytes) throw new Error(`Document is too large: ${bytes} bytes`);
  const digest = contentDigest(content).slice(0, 16);
  const dir = join(storageDir, "documents");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, `${digest}-${safeName}`);
  await writeFile(path, content, { encoding: "utf8", mode: 0o600 });
  return path;
}

export function readUpload(value: unknown): { name: string; content: string } {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("request body must be an object");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.name !== "string" || record.name.trim() === "") throw new Error("name is required");
  if (typeof record.content !== "string") throw new Error("content is required");
  return { name: record.name, content: record.content };
}

function sanitizeName(name: string): string {
  return basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
}
