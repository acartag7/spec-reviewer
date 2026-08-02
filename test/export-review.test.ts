import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMarkdownDocument } from "../src/domain/document.ts";
import { exportReviewMarkdown, reviewExportCounts } from "../src/application/export-review.ts";
import type { Review } from "../src/domain/review.ts";

test("exportReviewMarkdown emits agent-ready grouped feedback", () => {
  const document = parseMarkdownDocument("/tmp/spec.md", "# Spec\nBody\n");
  const review: Review = {
    documentPath: document.path,
    documentDigest: document.digest,
    summary: "Tighten the unresolved product decisions.",
    annotations: [
      annotation("a1", 2, "major", "issue", "Missing acceptance criteria"),
      { ...annotation("a2", 1, "blocker", "question", "Wrong product boundary"), status: "resolved" },
    ],
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    revision: 0,
    metrics: { activeMs: 0 },
  };

  const markdown = exportReviewMarkdown(document, review);

  assert.match(markdown, /# Agent Review Feedback/);
  assert.match(markdown, /Tighten the unresolved product decisions/);
  assert.match(markdown, /### Major/);
  assert.match(markdown, /Missing acceptance criteria/);
  assert.doesNotMatch(markdown, /Wrong product boundary/);
});

test("exportReviewMarkdown preserves exact source indentation and numbers", () => {
  const source = "- Retry policy\n    - 3 retries before failing\n    - Timeout is 30 - seconds";
  const document = parseMarkdownDocument("/tmp/spec.md", `# Spec\n${source}\n`);
  const review: Review = {
    documentPath: document.path,
    documentDigest: document.digest,
    summary: "",
    annotations: [{
      ...annotation("a1", 2, "major", "issue", "Preserve source evidence"),
      selectedText: "unverified flattened client quote",
      anchor: { state: "ok", lineStart: 2, lineEnd: 4, sourceText: source },
      anchorState: "ok",
    }],
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    revision: 0,
    metrics: { activeMs: 0 },
  };

  const markdown = exportReviewMarkdown(document, review);

  assert.match(markdown, /Selected text \(exact\):/);
  assert.match(markdown, /    - Retry policy\n        - 3 retries before failing\n        - Timeout is 30 - seconds/);
  assert.doesNotMatch(markdown, /Timeout is - seconds/);
  assert.doesNotMatch(markdown, /unverified flattened client quote/);
});

test("exportReviewMarkdown warns when review digest is stale", () => {
  const document = parseMarkdownDocument("/tmp/spec.md", "# Spec\nChanged\n");
  const review: Review = {
    documentPath: document.path,
    documentDigest: "old-digest",
    summary: "",
    annotations: [annotation("a1", 2, "major", "issue", "Check stale line")],
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    revision: 0,
    metrics: { activeMs: 0 },
  };

  const markdown = exportReviewMarkdown(document, review);

  assert.match(markdown, /Digest: old-digest/);
  assert.match(markdown, /Warning: this file changed/);
  assert.match(markdown, new RegExp(`Current digest: ${document.digest}`));
});

test("exportReviewMarkdown marks moved anchors and omits stale selected text", () => {
  const document = parseMarkdownDocument("/tmp/spec.md", "# Spec\nIntro\nMoved line\n");
  const review: Review = {
    documentPath: document.path,
    documentDigest: "old-digest",
    summary: "",
    annotations: [{
      ...annotation("a1", 2, "major", "issue", "Check moved line"),
      selectedText: "Old selected text",
      anchorText: "Moved line",
      anchor: { state: "moved", lineStart: 3, lineEnd: 3, sourceText: "Moved line" },
      anchorState: "moved",
    }],
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    revision: 0,
    metrics: { activeMs: 0 },
  };

  const markdown = exportReviewMarkdown(document, review);

  assert.match(markdown, /Anchor warning: 1 open annotation/);
  assert.match(markdown, /\[issue\] saved line 2 \(current line 3\)/);
  assert.match(markdown, /Anchor drift: saved text now appears at line 3/);
  assert.match(markdown, /Selected text omitted because the saved anchor is stale/);
  assert.doesNotMatch(markdown, /Selected text: Old selected text/);
});

test("exportReviewMarkdown keeps not-found prior-pass notes actionable", () => {
  const document = parseMarkdownDocument("/tmp/spec.md", "# Spec\nKept line\n");
  const review: Review = {
    documentPath: document.path,
    documentDigest: "old-digest",
    summary: "",
    annotations: [
      annotation("live", 2, "major", "issue", "Still here"),
      {
        ...annotation("gone", 5, "major", "issue", "Check missing line"),
        selectedText: "Missing selected text",
        anchorText: "Missing selected text",
        anchor: { state: "not-found", lineStart: null, lineEnd: null, sourceText: "Missing selected text" },
        anchorState: "not-found",
      },
    ],
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    revision: 0,
    metrics: { activeMs: 0 },
  };

  const markdown = exportReviewMarkdown(document, review);

  assert.match(markdown, /## Required Changes/);
  assert.match(markdown, /Still here/);
  assert.match(markdown, /Check missing line/);
  assert.doesNotMatch(markdown, /## Carried Over/);
  assert.match(markdown, /\(anchor not found\)/);
});

test("exportReviewMarkdown keeps a not-found anchor actionable when the review is current", () => {
  const document = parseMarkdownDocument("/tmp/spec.md", "# Spec\nChanged line\n");
  const review: Review = {
    documentPath: document.path,
    documentDigest: document.digest,
    summary: "",
    annotations: [{
      ...annotation("a1", 2, "major", "issue", "Resolve this live"),
      anchor: { state: "not-found", lineStart: null, lineEnd: null, sourceText: null },
      anchorState: "not-found",
    }],
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    revision: 0,
    metrics: { activeMs: 0 },
  };

  const markdown = exportReviewMarkdown(document, review);

  assert.match(markdown, /## Required Changes/);
  assert.match(markdown, /\[issue\] saved line 2 \(anchor not found\)/);
  assert.doesNotMatch(markdown, /## Carried Over/);
});

test("legacy selected text without an anchor gets one accurate warning", () => {
  const document = parseMarkdownDocument("/tmp/spec.md", "# Spec\nCurrent\n");
  const review: Review = {
    documentPath: document.path,
    documentDigest: document.digest,
    summary: "",
    annotations: [{ ...annotation("legacy", 2, "major", "issue", "Check manually"), selectedText: "Legacy quote" }],
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    revision: 0,
    metrics: { activeMs: 0 },
  };
  const markdown = exportReviewMarkdown(document, review);
  assert.match(markdown, /no server-owned source anchor is available/);
  assert.doesNotMatch(markdown, /saved anchor is stale/);
});

test("reviewExportCounts keeps every unresolved annotation open", () => {
  const document = parseMarkdownDocument("/tmp/spec.md", "# Spec\nKept line\n");
  const review: Review = {
    documentPath: document.path,
    documentDigest: "old-digest",
    summary: "",
    annotations: [
      annotation("live-ok", 2, "major", "issue", "Still here"),
      {
        ...annotation("gone-1", 5, "major", "issue", "Resolved by edit"),
        anchorText: "Gone",
        anchor: { state: "not-found", lineStart: null, lineEnd: null, sourceText: "Gone" },
        anchorState: "not-found",
      },
      {
        ...annotation("gone-2", 9, "minor", "suggestion", "Also resolved"),
        anchorText: "Also gone",
        anchor: { state: "not-found", lineStart: null, lineEnd: null, sourceText: "Also gone" },
        anchorState: "not-found",
      },
      { ...annotation("resolved", 3, "major", "issue", "Done"), status: "resolved" },
    ],
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    revision: 0,
    metrics: { activeMs: 0 },
  };

  const counts = reviewExportCounts(document, review);

  assert.equal(counts.openAnnotations, 3);
  assert.equal(counts.carriedOver, 0);
});

function annotation(id: string, line: number, severity: Review["annotations"][number]["severity"], kind: Review["annotations"][number]["kind"], note: string) {
  return {
    id,
    lineStart: line,
    lineEnd: line,
    section: "Spec",
    selectedText: null,
    kind,
    severity,
    status: "open" as const,
    note,
    agentAction: "Revise it.",
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    anchorText: null,
  };
}
