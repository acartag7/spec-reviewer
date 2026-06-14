import { createHash, randomUUID } from "node:crypto";

export function createAnnotationId(): string {
  return `ann_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

export function pathKey(path: string): string {
  return createHash("sha256").update(path).digest("hex").slice(0, 32);
}

export function contentDigest(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
