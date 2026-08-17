import type { ReviewDocument } from "./document.ts";

export interface RelocateIndex {
  normalized: string;
  normalizedLineByOffset: Map<number, number>;
}

export type AnchorRange = { lineStart: number; lineEnd: number };
export type AnchorMatch = AnchorRange | "ambiguous" | null;

const MIN_FRAGMENT = 40;
const MIN_PREFIX = 16;
const MAX_FRAGMENTS = 8;

export function collapseWs(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
}

function lineAt(map: Map<number, number>, offset: number): number | null {
  let found: number | null = null;
  for (const [start, line] of map) {
    if (start > offset) break;
    found = line;
  }
  return found;
}

function uniqueNormalized(index: RelocateIndex, needle: string): AnchorMatch {
  const collapsed = collapseWs(needle);
  if (collapsed === "") return null;
  let found: AnchorRange | null = null;
  let from = 0;
  while (from <= index.normalized.length) {
    const offset = boundedIndexOf(index.normalized, collapsed, from);
    if (offset < 0) break;
    const lineStart = lineAt(index.normalizedLineByOffset, offset);
    const lineEnd = lineAt(index.normalizedLineByOffset, offset + collapsed.length - 1);
    if (lineStart != null && lineEnd != null) {
      if (found != null) return "ambiguous";
      found = { lineStart, lineEnd };
    }
    from = offset + 1;
  }
  return found;
}

export function findRelocated(document: ReviewDocument, needle: string, index: RelocateIndex): AnchorMatch {
  return uniqueNormalized(index, needle)
    ?? findHeading(document, needle)
    ?? findFragments(document, needle, index)
    ?? findFirstLinePrefix(document, needle, index);
}

function findHeading(document: ReviewDocument, needle: string): AnchorMatch {
  if (needle.includes("\n")) return null;
  const parsed = /^(#{1,6})\s+(.+?)\s*$/.exec(needle);
  if (parsed == null) return null;
  const level = parsed[1]?.length ?? 0;
  const tokens = titleTokens(parsed[2] ?? "");
  if (tokens.length === 0) return null;
  let best: { range: AnchorRange; score: number } | null = null;
  let tied = false;
  for (const section of document.sections) {
    if (section.level !== level) continue;
    const score = jaccard(tokens, titleTokens(section.title));
    if (score < 1 / 3) continue;
    if (best == null || score > best.score) {
      best = { range: { lineStart: section.line, lineEnd: section.line }, score };
      tied = false;
    } else if (score === best.score) {
      tied = true;
    }
  }
  if (best == null) return null;
  return tied ? "ambiguous" : best.range;
}

function findFragments(document: ReviewDocument, needle: string, index: RelocateIndex): AnchorMatch {
  const hits: Array<AnchorRange & { weight: number }> = [];
  let sawAmbiguous = false;
  for (const fragment of distinctiveFragments(needle)) {
    const match = uniqueNormalized(index, fragment);
    if (match === "ambiguous") {
      sawAmbiguous = true;
      continue;
    }
    if (match != null) hits.push({ ...match, weight: fragment.length });
  }
  if (hits.length === 0) return sawAmbiguous ? "ambiguous" : null;
  return clusterHits(document, hits);
}

function findFirstLinePrefix(document: ReviewDocument, needle: string, index: RelocateIndex): AnchorMatch {
  const first = collapseWs(needle.split("\n")[0] ?? "");
  const words = first.split(" ").filter(Boolean);
  const minWords = /^(#{1,6}|[-*+]|\d+\.)\s/.test(needle) ? 3 : 4;
  for (let count = words.length; count >= minWords; count -= 1) {
    const prefix = words.slice(0, count).join(" ");
    if (prefix.length < MIN_PREFIX) break;
    const match = uniqueNormalized(index, prefix);
    if (match != null) return match === "ambiguous" ? match : expandToBlock(document, match);
  }
  return null;
}

function distinctiveFragments(needle: string): string[] {
  const collapsed = collapseWs(needle);
  const parts = [
    ...collapsed.split(/(?<=[.!?])\s+/).filter((part) => part.length >= MIN_FRAGMENT),
    ...needle.split("\n").map(collapseWs).filter((line) => line.length >= MIN_FRAGMENT),
  ].sort((left, right) => right.length - left.length);
  const seen = new Set<string>();
  const fragments: string[] = [];
  for (const part of parts) {
    if (seen.has(part)) continue;
    seen.add(part);
    fragments.push(part);
    if (fragments.length >= MAX_FRAGMENTS) break;
  }
  return fragments;
}

function clusterHits(document: ReviewDocument, hits: Array<AnchorRange & { weight: number }>): AnchorMatch {
  const sorted = [...hits].sort((left, right) => left.lineStart - right.lineStart);
  const clusters: Array<typeof hits> = [];
  for (const hit of sorted) {
    const current = clusters.at(-1);
    const previous = current?.at(-1);
    if (current != null && previous != null && sameCluster(document, previous, hit)) current.push(hit);
    else clusters.push([hit]);
  }
  const ranked = clusters
    .map((cluster) => ({ cluster, weight: cluster.reduce((sum, hit) => sum + hit.weight, 0) }))
    .sort((left, right) => right.weight - left.weight);
  const winner = ranked[0];
  const runnerUp = ranked[1];
  if (winner == null) return null;
  if (runnerUp != null && runnerUp.weight === winner.weight) return "ambiguous";
  return expandToBlock(document, unionRange(winner.cluster));
}

function sameCluster(document: ReviewDocument, left: AnchorRange, right: AnchorRange): boolean {
  if (sectionTitle(document, left.lineStart) !== sectionTitle(document, right.lineStart)) return false;
  return right.lineStart <= left.lineEnd + 8;
}

function sectionTitle(document: ReviewDocument, line: number): string {
  return document.lines[line - 1]?.sectionTitle ?? "";
}

function unionRange(hits: AnchorRange[]): AnchorRange {
  return {
    lineStart: Math.min(...hits.map((hit) => hit.lineStart)),
    lineEnd: Math.max(...hits.map((hit) => hit.lineEnd)),
  };
}

function expandToBlock(document: ReviewDocument, range: AnchorRange): AnchorRange {
  let { lineStart, lineEnd } = range;
  const startKind = document.lines[lineStart - 1]?.kind;
  if (startKind !== "list") {
    while (lineStart > 1 && !blockBoundary(document, lineStart - 1)) lineStart -= 1;
  }
  while (lineEnd < document.lines.length && !blockBoundary(document, lineEnd + 1)) lineEnd += 1;
  return { lineStart, lineEnd };
}

function blockBoundary(document: ReviewDocument, line: number): boolean {
  const item = document.lines[line - 1];
  return item == null || item.kind === "heading" || item.kind === "list" || item.kind === "blank";
}

function titleTokens(title: string): string[] {
  return title.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 2);
}

function jaccard(left: string[], right: string[]): number {
  const first = new Set(left);
  const second = new Set(right);
  let intersection = 0;
  for (const token of first) if (second.has(token)) intersection += 1;
  const union = first.size + second.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function boundedIndexOf(haystack: string, needle: string, from: number): number {
  let offset = haystack.indexOf(needle, from);
  while (offset >= 0) {
    const after = offset + needle.length;
    const startBound = offset === 0 || /\s/.test(haystack[offset - 1] ?? "");
    const endBound = after === haystack.length || /\s/.test(haystack[after] ?? "");
    if (startBound && endBound) return offset;
    offset = haystack.indexOf(needle, offset + 1);
  }
  return -1;
}
