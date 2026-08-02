import type { ReviewDocument } from "../domain/document.ts";
import type { Annotation, Review } from "../domain/review.ts";

const severityOrder = ["blocker", "major", "minor", "note"] as const;

export interface ReviewExportCounts {
  /** Live, actionable open annotations (shown under "Required Changes"). */
  openAnnotations: number;
  /** Compatibility field. Open annotations are never suppressed. */
  carriedOver: number;
}

export function exportReviewMarkdown(document: ReviewDocument, review: Review): string {
  const open = openAnnotations(review);
  const lines = [
    "# Agent Review Feedback",
    "",
    `Document: ${document.path}`,
    `Digest: ${review.documentDigest}`,
    "",
  ];
  if (review.documentDigest !== document.digest) {
    lines.push(
      "Warning: this file changed after these notes were saved. Recheck anchors before editing.",
      `Current digest: ${document.digest}`,
      "",
    );
  }
  const movedLive = open.filter((annotation) => annotation.anchor?.state === "moved");
  if (movedLive.length > 0) {
    lines.push(
      `Anchor warning: ${movedLive.length} open annotation${movedLive.length === 1 ? "" : "s"} relocated since saving; current lines shown below.`,
      "",
    );
  }

  if (review.summary.trim() !== "") {
    lines.push("## Overall", "", review.summary.trim(), "");
  }

  if (open.length === 0) {
    lines.push("No open annotations.");
    return lines.join("\n");
  }

  lines.push("## Required Changes", "");
  for (const severity of severityOrder) {
    const group = open.filter((annotation) => annotation.severity === severity);
    if (group.length === 0) continue;
    lines.push(`### ${label(severity)}`, "");
    for (const annotation of group) {
      lines.push(...formatAnnotation(annotation), "");
    }
  }
  lines.push("## Instruction", "");
  lines.push("Address each open annotation, preserve existing behavior unless the note explicitly asks for a change, then report what changed and how you verified it.");

  return lines.join("\n");
}

export function reviewExportCounts(_document: ReviewDocument, review: Review): ReviewExportCounts {
  return { openAnnotations: openAnnotations(review).length, carriedOver: 0 };
}

function openAnnotations(review: Review): Annotation[] {
  return review.annotations.filter((annotation) => annotation.status === "open");
}

function formatAnnotation(annotation: Annotation): string[] {
  const range = annotationRange(annotation);
  const header = `- [${annotation.kind}] ${range}${annotation.section ? `, ${annotation.section}` : ""}`;
  const lines = [header, `  - Feedback: ${annotation.note}`];
  if (annotation.agentAction.trim() !== "") {
    lines.push(`  - Agent action: ${annotation.agentAction.trim()}`);
  }
  if (annotation.anchor?.state === "moved") {
    lines.push(`  - Anchor drift: saved text now appears at ${anchorRange(annotation.anchor)}; confirm before editing.`);
  }
  if (annotation.anchor?.state === "not-found") {
    lines.push("  - Anchor drift: saved source text was not found in the current file; confirm manually before editing.");
  }
  if (annotation.anchor?.state === "ambiguous") {
    lines.push("  - Anchor drift: saved source text occurs more than once in the current file; confirm the intended location manually.");
  }
  if (annotation.anchor == null) {
    lines.push("  - Anchor verification: no server-owned source anchor is available; confirm manually before editing.");
  }
  if (annotation.anchor?.state === "ok" && annotation.anchor.sourceText != null) {
    lines.push(...quoteBlock(annotation.anchor.sourceText));
  } else if (annotation.selectedText != null && annotation.anchor != null) {
    lines.push("  - Selected text omitted because the saved anchor is stale.");
  }
  return lines;
}

function anchorRange(anchor: NonNullable<Annotation["anchor"]>): string {
  if (anchor.lineStart == null) return "unknown current lines";
  if (anchor.lineEnd == null || anchor.lineEnd === anchor.lineStart) return `line ${anchor.lineStart}`;
  return `lines ${anchor.lineStart}-${anchor.lineEnd}`;
}

function annotationRange(annotation: Annotation): string {
  const saved = savedRange(annotation, annotation.anchor?.state != null && annotation.anchor.state !== "ok");
  if (annotation.anchor?.state === "moved") return `${saved} (current ${anchorRange(annotation.anchor)})`;
  if (annotation.anchor?.state === "ambiguous") return `${saved} (anchor ambiguous)`;
  if (annotation.anchor?.state === "not-found") return `${saved} (anchor not found)`;
  return saved;
}

function savedRange(annotation: Pick<Annotation, "lineStart" | "lineEnd">, stale = false): string {
  const prefix = stale ? "saved " : "";
  return annotation.lineStart === annotation.lineEnd
    ? `${prefix}line ${annotation.lineStart}`
    : `${prefix}lines ${annotation.lineStart}-${annotation.lineEnd}`;
}

function label(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function quoteBlock(value: string): string[] {
  const normalized = value.replace(/\r\n?/g, "\n");
  const fence = safeFence(normalized);
  return [
    "  - Selected text (exact):",
    `    ${fence}text`,
    ...normalized.split("\n").map((line) => `    ${line}`),
    `    ${fence}`,
  ];
}

function safeFence(value: string): string {
  const backticks = longestRun(value, /`+/g);
  const tildes = longestRun(value, /~+/g);
  const character = backticks <= tildes ? "`" : "~";
  return character.repeat(Math.max(3, Math.min(backticks, tildes) + 1));
}

function longestRun(value: string, pattern: RegExp): number {
  let longest = 0;
  for (const match of value.matchAll(pattern)) longest = Math.max(longest, match[0].length);
  return longest;
}
