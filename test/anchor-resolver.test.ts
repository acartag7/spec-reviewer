import assert from "node:assert/strict";
import { test } from "node:test";
import { exportReviewMarkdown } from "../src/application/export-review.ts";
import { parseMarkdownDocument } from "../src/domain/document.ts";
import { createEmptyReview, withResolvedAnchors } from "../src/domain/review.ts";

function anchoredReview(content: string, anchorText: string, line = 8) {
  const document = parseMarkdownDocument("/tmp/spec.md", content);
  const review = createEmptyReview(document.path, "0".repeat(64));
  review.annotations = [{
    id: "anchor",
    lineStart: line,
    lineEnd: line,
    section: "Spec",
    selectedText: anchorText,
    kind: "issue",
    severity: "major",
    status: "open",
    note: "Use the intended source",
    agentAction: "Revise it.",
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    anchorText,
  }];
  return { document, review };
}

test("duplicate moved anchor text is ambiguous instead of silently relocated", () => {
  const { document, review } = anchoredReview("# Spec\nTODO: fix\nMiddle\nTODO: fix\n", "TODO: fix");
  const resolved = withResolvedAnchors(document, review);
  assert.equal(resolved.annotations.at(0)?.anchorState, "ambiguous");
  const markdown = exportReviewMarkdown(document, resolved);
  assert.match(markdown, /anchor ambiguous/);
  assert.match(markdown, /occurs more than once/);
  assert.match(markdown, /Selected text omitted because the saved anchor is stale/);
  assert.doesNotMatch(markdown, /Selected text \(exact\):/);
});

test("indentation changes invalidate selected-text evidence", () => {
  const { document, review } = anchoredReview("# Spec\n  child\n", "child", 2);
  const resolved = withResolvedAnchors(document, review);
  assert.equal(resolved.annotations.at(0)?.anchorState, "not-found");
  assert.match(exportReviewMarkdown(document, resolved), /Selected text omitted/);
});
