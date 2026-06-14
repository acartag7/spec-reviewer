import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMarkdownDocument } from "../src/domain/document.ts";
import { exportReviewMarkdown } from "../src/application/export-review.ts";
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
  };

  const markdown = exportReviewMarkdown(document, review);

  assert.match(markdown, /# Agent Review Feedback/);
  assert.match(markdown, /Tighten the unresolved product decisions/);
  assert.match(markdown, /### Major/);
  assert.match(markdown, /Missing acceptance criteria/);
  assert.doesNotMatch(markdown, /Wrong product boundary/);
});

test("exportReviewMarkdown cleans old selected text line numbers", () => {
  const document = parseMarkdownDocument("/tmp/spec.md", "# Spec\nBody\n");
  const review: Review = {
    documentPath: document.path,
    documentDigest: document.digest,
    summary: "",
    annotations: [{
      ...annotation("a1", 2, "major", "issue", "Line number pollution"),
      selectedText: "90\n- first point\n91\n- second point 92 - third point",
    }],
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
  };

  const markdown = exportReviewMarkdown(document, review);

  assert.match(markdown, /- first point - second point - third point/);
  assert.doesNotMatch(markdown, /91 - second/);
  assert.doesNotMatch(markdown, /90 - first/);
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
  };

  const markdown = exportReviewMarkdown(document, review);

  assert.match(markdown, /Anchor warning: 1 open annotation/);
  assert.match(markdown, /\[issue\] saved line 2 \(current line 3\)/);
  assert.match(markdown, /Anchor drift: saved text now appears at line 3/);
  assert.match(markdown, /Selected text omitted because the saved anchor is stale/);
  assert.doesNotMatch(markdown, /Selected text: Old selected text/);
});

test("exportReviewMarkdown marks not-found anchors and omits stale selected text", () => {
  const document = parseMarkdownDocument("/tmp/spec.md", "# Spec\nChanged line\n");
  const review: Review = {
    documentPath: document.path,
    documentDigest: "old-digest",
    summary: "",
    annotations: [{
      ...annotation("a1", 2, "major", "issue", "Check missing line"),
      selectedText: "Missing selected text",
      anchorText: "Missing selected text",
      anchor: { state: "not-found", lineStart: null, lineEnd: null, sourceText: "Missing selected text" },
      anchorState: "not-found",
    }],
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
  };

  const markdown = exportReviewMarkdown(document, review);

  assert.match(markdown, /\[issue\] saved line 2 \(anchor not found\)/);
  assert.match(markdown, /saved source text was not found/);
  assert.match(markdown, /Selected text omitted because the saved anchor is stale/);
  assert.doesNotMatch(markdown, /Selected text: Missing selected text/);
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
