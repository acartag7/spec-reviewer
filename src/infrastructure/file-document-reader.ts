import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { expandHome } from "../config.ts";
import { parseReviewDocument, type ReviewDocument } from "../domain/document.ts";
import { assertReviewablePath, decodeReviewText } from "../domain/document-format.ts";
import { AppError } from "../domain/errors.ts";
import type { DocumentReader } from "../application/ports.ts";

const maxDocumentBytes = 2 * 1024 * 1024;

export class FileDocumentReader implements DocumentReader {
  resolvePath(inputPath: string): string {
    return resolve(expandHome(inputPath));
  }

  async readMarkdown(inputPath: string): Promise<{ document: ReviewDocument; content: string }> {
    const path = this.resolvePath(inputPath);
    assertReviewablePath(path);
    const info = await stat(path);
    if (!info.isFile()) throw new AppError("invalid_request", 400, "Document path must be a file");
    if (info.size > maxDocumentBytes) {
      throw new AppError("invalid_request", 400, "Document is too large");
    }
    const content = decodeReviewText(await readFile(path));
    return { document: parseReviewDocument(path, content), content };
  }
}
