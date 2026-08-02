import { readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { expandHome } from "../config.ts";
import { parseMarkdownDocument, type ReviewDocument } from "../domain/document.ts";
import { AppError } from "../domain/errors.ts";
import type { DocumentReader } from "../application/ports.ts";

const maxDocumentBytes = 2 * 1024 * 1024;
const allowedExtensions = new Set([".md", ".markdown"]);

export class FileDocumentReader implements DocumentReader {
  resolvePath(inputPath: string): string {
    return resolve(expandHome(inputPath));
  }

  async readMarkdown(inputPath: string): Promise<{ document: ReviewDocument; content: string }> {
    const path = this.resolvePath(inputPath);
    const extension = extname(path).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      throw new AppError("invalid_request", 400, "Only .md and .markdown files can be reviewed");
    }
    const info = await stat(path);
    if (!info.isFile()) throw new AppError("invalid_request", 400, "Document path must be a file");
    if (info.size > maxDocumentBytes) {
      throw new AppError("invalid_request", 400, "Document is too large");
    }
    const content = await readFile(path, "utf8");
    return { document: parseMarkdownDocument(path, content), content };
  }
}
