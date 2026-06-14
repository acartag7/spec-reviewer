import { readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { expandHome } from "../config.ts";
import { parseMarkdownDocument, type ReviewDocument } from "../domain/document.ts";
import type { DocumentReader } from "../application/ports.ts";

const maxDocumentBytes = 2 * 1024 * 1024;
const allowedExtensions = new Set([".md", ".markdown"]);

export class FileDocumentReader implements DocumentReader {
  async readMarkdown(inputPath: string): Promise<{ document: ReviewDocument; content: string }> {
    const path = resolve(expandHome(inputPath));
    const extension = extname(path).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      throw new Error("Only .md and .markdown files can be reviewed");
    }
    const info = await stat(path);
    if (!info.isFile()) throw new Error(`Not a file: ${path}`);
    if (info.size > maxDocumentBytes) {
      throw new Error(`Document is too large: ${info.size} bytes`);
    }
    const content = await readFile(path, "utf8");
    return { document: parseMarkdownDocument(path, content), content };
  }
}
