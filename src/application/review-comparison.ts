import { structuredPatch } from "diff";
import { splitSourceText } from "../domain/document.ts";
import type { DiffRow, ReviewComparison } from "../domain/review-comparison.ts";
import type { ReviewRound } from "../domain/review-round.ts";

const DEFAULT_MAX_LINES = 20_000;
const DEFAULT_MAX_EDIT_LENGTH = 20_000;
const DEFAULT_TIMEOUT_MS = 1_000;

export interface DiffLimits {
  maxLines?: number;
  maxEditLength?: number;
  timeoutMs?: number;
}

export function buildReviewComparison(
  round: ReviewRound,
  afterText: string,
  afterDigest: string,
  limits: DiffLimits = {},
): ReviewComparison {
  const metadata = {
    roundId: round.id,
    completedAt: round.completedAt,
    beforeDigest: round.documentDigest,
    afterDigest,
  };
  if (round.documentDigest === afterDigest) {
    return { state: "unchanged", ...metadata, added: 0, removed: 0, rows: [] };
  }
  const before = canonicalSource(round.sourceText);
  const after = canonicalSource(afterText);
  const maxLines = limits.maxLines ?? DEFAULT_MAX_LINES;
  if (displayLineCount(before) + displayLineCount(after) > maxLines) {
    return { state: "too-large", ...metadata, added: null, removed: null, rows: [] };
  }
  let patch: { hunks: PatchHunk[] } | undefined;
  try {
    patch = structuredPatch("before", "after", before, after, undefined, undefined, {
      context: 3,
      maxEditLength: limits.maxEditLength ?? DEFAULT_MAX_EDIT_LENGTH,
      timeout: limits.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
  } catch {
    patch = undefined;
  }
  if (patch == null) return { state: "too-large", ...metadata, added: null, removed: null, rows: [] };
  if (patch.hunks.length === 0) {
    return { state: "unchanged", ...metadata, added: 0, removed: 0, rows: [] };
  }
  const { rows, added, removed } = rowsFromHunks(patch.hunks);
  return { state: "diff", ...metadata, added, removed, rows };
}

function canonicalSource(value: string): string {
  return value.replaceAll("\r\n", "\n");
}

function displayLineCount(value: string): number {
  if (value === "") return 0;
  const split = splitSourceText(value);
  return split.lines.length - (split.hasFinalNewline ? 1 : 0);
}

interface PatchHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

function rowsFromHunks(hunks: PatchHunk[]): {
  rows: DiffRow[];
  added: number;
  removed: number;
} {
  const rows: DiffRow[] = [];
  let added = 0;
  let removed = 0;
  let previousOldEnd: number | null = null;
  let previousNewEnd: number | null = null;
  for (const hunk of hunks) {
    if (previousOldEnd != null && previousNewEnd != null) {
      const hiddenOld = Math.max(0, hunk.oldStart - previousOldEnd);
      const hiddenNew = Math.max(0, hunk.newStart - previousNewEnd);
      if (hiddenOld > 0 || hiddenNew > 0) rows.push({ kind: "gap", hiddenOld, hiddenNew });
    }
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;
    for (const line of hunk.lines) {
      const marker = line[0];
      const text = line.slice(1);
      if (marker === " ") {
        rows.push({ kind: "context", oldLine, newLine, text });
        oldLine += 1;
        newLine += 1;
      } else if (marker === "-") {
        rows.push({ kind: "remove", oldLine, newLine: null, text });
        oldLine += 1;
        removed += 1;
      } else if (marker === "+") {
        rows.push({ kind: "add", oldLine: null, newLine, text });
        newLine += 1;
        added += 1;
      } else if (line === "\\ No newline at end of file") {
        rows.push({ kind: "no-newline", oldLine: null, newLine: null, text: "No newline at end of file" });
      }
    }
    previousOldEnd = hunk.oldStart + hunk.oldLines;
    previousNewEnd = hunk.newStart + hunk.newLines;
  }
  return { rows, added, removed };
}
