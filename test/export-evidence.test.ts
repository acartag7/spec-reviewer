import assert from "node:assert/strict";
import { test } from "node:test";
import { exportReviewMarkdown } from "../src/application/export-review.ts";
import { parseMarkdownDocument } from "../src/domain/document.ts";
import { createEmptyReview } from "../src/domain/review.ts";

function exportSource(sourceText: string): string {
  const document = parseMarkdownDocument("/tmp/spec.md", `# Spec\n${sourceText}\n`);
  const review = createEmptyReview(document.path, document.digest);
  review.annotations = [{
    id: "evidence",
    lineStart: 2,
    lineEnd: document.lines.length,
    section: "Spec",
    selectedText: "forged client quote",
    kind: "issue",
    severity: "major",
    status: "open",
    note: "Keep the exact block",
    agentAction: "",
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    anchorText: sourceText,
    anchor: { state: "ok", lineStart: 2, lineEnd: document.lines.length, sourceText },
    anchorState: "ok",
  }];
  return exportReviewMarkdown(document, review);
}

test("source evidence preserves blank lines and escalates a backtick fence", () => {
  const markdown = exportSource("before\n\n```instruction\n~~~also fenced");
  assert.match(markdown, /    ````text\n    before\n    \n    ```instruction\n    ~~~also fenced\n    ````\n/);
});

test("source evidence uses a tilde fence when backtick runs are longer", () => {
  const markdown = exportSource("before ````` after");
  assert.match(markdown, /    ~~~text\n    before ````` after\n    ~~~\n/);
});
