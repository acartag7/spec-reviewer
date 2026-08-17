import { basename } from "node:path";
import { assertReviewablePath, type ReviewDocumentFormat } from "./document-format.ts";
import { contentDigest } from "./ids.ts";

export type { ReviewDocumentFormat } from "./document-format.ts";
export type LineKind = "heading" | "list" | "quote" | "code" | "blank" | "normal";

export interface DocumentLine {
  number: number;
  text: string;
  kind: LineKind;
  sectionTitle: string | null;
}

export interface DocumentSection {
  line: number;
  level: number;
  title: string;
}

export interface ReviewDocument {
  path: string;
  title: string;
  digest: string;
  format: ReviewDocumentFormat;
  lines: DocumentLine[];
  sections: DocumentSection[];
}

export interface SourceTextLines {
  lines: string[];
  hasFinalNewline: boolean;
}

export function splitSourceText(content: string): SourceTextLines {
  return { lines: content.split(/\r?\n/), hasFinalNewline: content.endsWith("\n") };
}

export function parseMarkdownDocument(path: string, content: string): ReviewDocument {
  const rawLines = splitSourceText(content).lines;
  const sections: DocumentSection[] = [];
  const lines: DocumentLine[] = [];
  let inCode = false;
  let currentSection: string | null = null;

  rawLines.forEach((text, index) => {
    const number = index + 1;
    const heading = inCode ? null : /^(#{1,6})\s+(.+?)\s*$/.exec(text);
    if (heading != null) {
      currentSection = heading[2] ?? null;
      sections.push({ line: number, level: heading[1]?.length ?? 1, title: currentSection ?? "" });
    }

    const kind = classifyLine(text, inCode, heading != null);
    lines.push({ number, text, kind, sectionTitle: currentSection });
    if (/^\s*```/.test(text)) inCode = !inCode;
  });

  const firstH1 = sections.find((section) => section.level === 1);
  return {
    path,
    title: firstH1?.title ?? basename(path),
    digest: contentDigest(content),
    format: "markdown",
    lines,
    sections,
  };
}

export function parseSourceDocument(path: string, content: string): ReviewDocument {
  const lines: DocumentLine[] = splitSourceText(content).lines.map((text, index) => ({
    number: index + 1,
    text,
    kind: text.trim() === "" ? "blank" : "normal",
    sectionTitle: null,
  }));
  return {
    path,
    title: basename(path),
    digest: contentDigest(content),
    format: "source",
    lines,
    sections: [],
  };
}

export function parseReviewDocument(path: string, content: string): ReviewDocument {
  return assertReviewablePath(path) === "markdown"
    ? parseMarkdownDocument(path, content)
    : parseSourceDocument(path, content);
}

export function sectionForLine(document: ReviewDocument, lineNumber: number): string | null {
  let match: DocumentSection | null = null;
  for (const section of document.sections) {
    if (section.line > lineNumber) break;
    match = section;
  }
  return match?.title ?? null;
}

function classifyLine(text: string, inCode: boolean, heading: boolean): LineKind {
  if (inCode || /^\s*```/.test(text)) return "code";
  if (heading) return "heading";
  if (text.trim() === "") return "blank";
  if (/^\s*[-*+]\s+/.test(text) || /^\s*\d+\.\s+/.test(text)) return "list";
  if (/^\s*>/.test(text)) return "quote";
  return "normal";
}
