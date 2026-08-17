import type { ReviewDocument } from "./document.ts";
import type { Annotation, AnnotationAnchor, Review } from "./review.ts";
import {
  collapseWs,
  findRelocated,
  type AnchorMatch,
  type AnchorRange,
  type RelocateIndex,
} from "./anchor-relocator.ts";

interface DocumentTextIndex extends RelocateIndex {
  text: string;
  lineByOffset: Map<number, number>;
  movedByText: Map<string, AnchorMatch>;
}

export function withResolvedAnchors(document: ReviewDocument, review: Review): Review {
  const index = createTextIndex(document);
  return {
    ...review,
    annotations: review.annotations.map((annotation) => {
      const anchor = resolveAnchor(document, annotation, index);
      return { ...annotation, anchor, anchorState: anchor?.state };
    }),
  };
}

export function sourceTextForLines(document: ReviewDocument, start: number, end: number): string | null {
  if (start < 1 || end < start || end > document.lines.length) return null;
  const lines = document.lines.slice(start - 1, end);
  if (lines.length !== end - start + 1) return null;
  const text = lines.map((line) => line.text).join("\n");
  return text.trim() === "" ? null : text;
}

function createTextIndex(document: ReviewDocument): DocumentTextIndex {
  const lineByOffset = new Map<number, number>();
  const normalizedOffsets: number[] = [];
  const normalizedLines: number[] = [];
  const normalizedParts: string[] = [];
  let offset = 0;
  let normalizedOffset = 0;
  for (const line of document.lines) {
    lineByOffset.set(offset, line.number);
    offset += line.text.length + 1;
    const collapsed = collapseWs(line.text);
    if (collapsed === "") continue;
    if (normalizedOffset > 0) normalizedOffset += 1;
    normalizedOffsets.push(normalizedOffset);
    normalizedLines.push(line.number);
    normalizedParts.push(collapsed);
    normalizedOffset += collapsed.length;
  }
  return {
    text: document.lines.map((line) => line.text).join("\n"),
    lineByOffset,
    normalized: normalizedParts.join(" "),
    normalizedOffsets,
    normalizedLines,
    movedByText: new Map(),
  };
}

function resolveAnchor(
  document: ReviewDocument,
  annotation: Annotation,
  index: DocumentTextIndex,
): AnnotationAnchor | null {
  if (annotation.anchorText == null || annotation.anchorText.trim() === "") return null;
  const current = sourceTextForLines(document, annotation.lineStart, annotation.lineEnd);
  if (sameSource(current, annotation.anchorText)) {
    return {
      state: "ok",
      lineStart: annotation.lineStart,
      lineEnd: annotation.lineEnd,
      sourceText: annotation.anchorText,
    };
  }
  const moved = findAnchor(document, annotation.anchorText, index);
  if (moved === "ambiguous") {
    return { state: "ambiguous", lineStart: null, lineEnd: null, sourceText: annotation.anchorText };
  }
  if (moved != null) return { ...moved, state: "moved", sourceText: annotation.anchorText };
  return { state: "not-found", lineStart: null, lineEnd: null, sourceText: annotation.anchorText };
}

function findAnchor(document: ReviewDocument, anchorText: string, index: DocumentTextIndex): AnchorMatch {
  const needle = anchorText.replace(/\r\n/g, "\n");
  if (index.movedByText.has(needle)) return index.movedByText.get(needle) ?? null;
  const found = findExact(document, needle, index) ?? findRelocated(document, needle, index);
  index.movedByText.set(needle, found);
  return found;
}

function findExact(document: ReviewDocument, needle: string, index: DocumentTextIndex): AnchorMatch {
  const lineCount = needle.split("\n").length;
  let found: AnchorRange | null = null;
  let offset = index.text.indexOf(needle);
  while (offset >= 0) {
    const lineStart = index.lineByOffset.get(offset);
    const after = offset + needle.length;
    const endsAtBoundary = after === index.text.length || index.text[after] === "\n";
    if (lineStart != null && endsAtBoundary) {
      const lineEnd = lineStart + lineCount - 1;
      if (sameSource(sourceTextForLines(document, lineStart, lineEnd), needle)) {
        const result = { lineStart, lineEnd };
        if (found != null) return "ambiguous";
        found = result;
      }
    }
    offset = index.text.indexOf(needle, offset + 1);
  }
  return found;
}

function sameSource(left: string | null, right: string): boolean {
  return (left ?? "").replace(/\r\n/g, "\n") === right.replace(/\r\n/g, "\n");
}
