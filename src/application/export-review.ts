import type { ReviewDocument } from "../domain/document.ts";
import type { Annotation, Review } from "../domain/review.ts";

const severityOrder = ["blocker", "major", "minor", "note"] as const;

export interface ReviewExportCounts {
  /** Live, actionable open annotations (shown under "Required Changes"). */
  openAnnotations: number;
  /** Prior-pass open annotations suppressed from action items (shown under "Carried Over"). */
  carriedOver: number;
}

export function exportReviewMarkdown(document: ReviewDocument, review: Review): string {
  const { live } = partitionOpen(document, review);
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
  const movedLive = live.filter((annotation) => annotation.anchor?.state === "moved");
  if (movedLive.length > 0) {
    lines.push(
      `Anchor warning: ${movedLive.length} open annotation${movedLive.length === 1 ? "" : "s"} relocated since saving; current lines shown below.`,
      "",
    );
  }

  if (review.summary.trim() !== "") {
    lines.push("## Overall", "", review.summary.trim(), "");
  }

  if (live.length === 0) {
    lines.push("No open annotations.");
    return lines.join("\n");
  }

  // Only current-version notes reach the agent copy. Prior-pass notes whose
  // source text disappeared (carried over) are excluded entirely — they point at
  // text that no longer exists, so they are not actionable, and the human had a
  // chance to re-anchor any that still apply. The suppressed count is reported
  // on the JSON completion via reviewExportCounts, not in this markdown.
  lines.push("## Required Changes", "");
  for (const severity of severityOrder) {
    const group = live.filter((annotation) => annotation.severity === severity);
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

export function reviewExportCounts(document: ReviewDocument, review: Review): ReviewExportCounts {
  const { live, carriedOver } = partitionOpen(document, review);
  return { openAnnotations: live.length, carriedOver: carriedOver.length };
}

/**
 * Split open annotations into live action items and carried-over prior-pass notes.
 *
 * A note is carried over when its saved anchor text can no longer be found in the
 * current file (anchor state "not-found") AND the review was saved against an older
 * digest. That combination means the lines the note pointed at are gone — almost
 * certainly because a prior edit addressed it. Carried-over notes are excluded from
 * the agent markdown (they are not actionable) but still counted, so the completion
 * can report how many were suppressed. "moved" notes (text still present, relocated)
 * stay live so relocations are always flagged, never silently applied.
 */
function partitionOpen(document: ReviewDocument, review: Review): { live: Annotation[]; carriedOver: Annotation[] } {
  const staleReview = review.documentDigest !== document.digest;
  const open = review.annotations.filter((annotation) => annotation.status === "open");
  const carriedOver = open.filter((annotation) => annotation.anchor?.state === "not-found" && staleReview);
  const live = open.filter((annotation) => !(annotation.anchor?.state === "not-found" && staleReview));
  return { live, carriedOver };
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
  if (annotation.selectedText != null && (annotation.anchor == null || annotation.anchor.state === "ok")) {
    lines.push(`  - Selected text: ${quoteInline(annotation.selectedText)}`);
  } else if (annotation.selectedText != null) {
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

function quoteInline(value: string): string {
  const compact = value
    .split(/\n/)
    .map((line) => line.replace(/^\s*\d+\s+/, "").replace(/^\s*\d+\s*$/, ""))
    .filter((line) => line.trim() !== "")
    .join(" ")
    .replace(/\s+\d+\s+(?=-\s)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}
