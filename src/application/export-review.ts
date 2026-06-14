import type { ReviewDocument } from "../domain/document.ts";
import type { Annotation, Review } from "../domain/review.ts";

const severityOrder = ["blocker", "major", "minor", "note"] as const;

export function exportReviewMarkdown(document: ReviewDocument, review: Review): string {
  const open = review.annotations.filter((annotation) => annotation.status === "open");
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

function formatAnnotation(annotation: Annotation): string[] {
  const range = annotation.lineStart === annotation.lineEnd
    ? `line ${annotation.lineStart}`
    : `lines ${annotation.lineStart}-${annotation.lineEnd}`;
  const header = `- [${annotation.kind}] ${range}${annotation.section ? `, ${annotation.section}` : ""}`;
  const lines = [header, `  - Feedback: ${annotation.note}`];
  if (annotation.agentAction.trim() !== "") {
    lines.push(`  - Agent action: ${annotation.agentAction.trim()}`);
  }
  if (annotation.selectedText != null) {
    lines.push(`  - Selected text: ${quoteInline(annotation.selectedText)}`);
  }
  return lines;
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
