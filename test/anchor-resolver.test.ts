import assert from "node:assert/strict";
import { test } from "node:test";
import { exportReviewMarkdown } from "../src/application/export-review.ts";
import { parseMarkdownDocument } from "../src/domain/document.ts";
import { createEmptyReview, withResolvedAnchors } from "../src/domain/review.ts";

function resolveOn(content: string, anchorText: string, line = 2, lineEnd = line) {
  const document = parseMarkdownDocument("/tmp/spec.md", content);
  const review = createEmptyReview(document.path, "0".repeat(64));
  review.annotations = [{
    id: "anchor",
    lineStart: line,
    lineEnd,
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
  const resolved = withResolvedAnchors(document, review);
  return { document, review: resolved, annotation: resolved.annotations[0]! };
}

test("exact source at the saved lines stays ok", () => {
  const { annotation } = resolveOn("# Spec\nKeep this line\n", "Keep this line");
  assert.equal(annotation.anchorState, "ok");
  assert.equal(annotation.anchor?.lineStart, 2);
});

test("duplicate moved anchor text is ambiguous instead of silently relocated", () => {
  const { document, review, annotation } = resolveOn("# Spec\nTODO: fix\nMiddle\nTODO: fix\n", "TODO: fix", 8);
  assert.equal(annotation.anchorState, "ambiguous");
  const markdown = exportReviewMarkdown(document, review);
  assert.match(markdown, /anchor ambiguous/);
  assert.match(markdown, /occurs more than once/);
  assert.match(markdown, /Selected text omitted because the saved anchor is stale/);
  assert.doesNotMatch(markdown, /Selected text \(exact\):/);
});

test("indentation changes relocate without quoting stale evidence", () => {
  const { document, review, annotation } = resolveOn("# Spec\n  child\n", "child");
  assert.equal(annotation.anchorState, "moved");
  assert.equal(annotation.anchor?.lineStart, 2);
  assert.match(exportReviewMarkdown(document, review), /Selected text omitted/);
});

test("rewritten paragraph with a surviving sentence is moved", () => {
  const anchor = [
    "**Recommendation and reasoning.** Immediately qualify the quickstart threat",
    "model and every unconditional `0700`/`0600` guarantee as POSIX-only, and emit one",
    "loud boot warning when quickstart or persistent SQLite state is opened on",
    "Windows: DACL privacy was not verified and the deployer must use a private",
    "ACL-controlled directory. Do not claim Windows deployments are exposed. A",
    "future DACL admission feature needs Windows-native measurements and a separate",
    "contract; the honest warning is the minimum fix that can ship without inventing",
    "an untested access model.",
  ].join("\n");
  const { annotation } = resolveOn([
    "# Spec",
    "",
    "## B5 — state the Windows filesystem limit and warn at boot",
    "",
    "**Recommendation and reasoning.** Qualify every unconditional `0700`/`0600`",
    "claim as POSIX-only and emit one loud boot warning when quickstart or persistent",
    "SQLite state is opened on Windows: DACL privacy was not verified and a private",
    "ACL-controlled directory is required. Do not claim Windows deployments are",
    "exposed. Full DACL admission needs Windows/Node 24 measurements and a separate",
    "contract; issue #219 tracks that larger work.",
    "",
    "## B6 — other item",
    "",
    "**Recommendation and reasoning.** Make no runtime change for this item.",
  ].join("\n"), anchor, 5, 12);
  assert.equal(annotation.anchorState, "moved");
  assert.ok((annotation.anchor?.lineStart ?? 0) >= 5);
  assert.ok((annotation.anchor?.lineEnd ?? 0) <= 10);
});

test("rewritten paragraph keeps a surviving suffix on the same section", () => {
  const anchor = [
    "**Recommendation and reasoning.** Keep refresh independent of client existence",
    "for now and make applications that delete stored registrations revoke the",
    "associated families in the same lifecycle operation. Do not add a universal",
    "refresh-time client lookup: it would reject every stateless-DCR refresh and",
    "change the meaning of stored client deletion without a migration policy.",
  ].join("\n");
  const { annotation } = resolveOn([
    "# Spec",
    "",
    "## B5 — windows",
    "",
    "**Recommendation and reasoning.** Qualify the POSIX-only warning.",
    "Do not claim Windows deployments are exposed.",
    "",
    "## B6 — client deletion",
    "",
    "**Recommendation and reasoning.** Make no mcp-sso runtime change for this item.",
    "Do not add a universal refresh-time client lookup: it would reject every",
    "stateless-DCR refresh and change the meaning of stored client deletion without",
    "a migration policy. If 0.4.0 later makes stored-client existence authoritative,",
    "design the mode discriminator before code.",
  ].join("\n"), anchor, 10, 14);
  assert.equal(annotation.anchorState, "moved");
  assert.ok((annotation.anchor?.lineStart ?? 0) >= 10);
  assert.ok((annotation.anchor?.lineEnd ?? 99) <= 14);
});

test("rewrapped table cells are moved", () => {
  const { annotation } = resolveOn(
    "# Spec\n| timeout | 30 seconds before the\nrequest fails |\n",
    "| timeout | 30 seconds before the request fails |",
  );
  assert.equal(annotation.anchorState, "moved");
  assert.equal(annotation.anchor?.lineStart, 2);
  assert.equal(annotation.anchor?.lineEnd, 3);
});

test("renamed heading is moved", () => {
  const { annotation } = resolveOn("# Spec\n## Retry and timeout policy\nBody\n", "## Retry policy");
  assert.equal(annotation.anchorState, "moved");
  assert.equal(annotation.anchor?.lineStart, 2);
});

test("rewritten list item keeps a unique prefix location", () => {
  const anchor = [
    "- **APPROVED WITH CHANGES** — annotate the item(s) and exact replacement rule;",
    "  unchanged items follow the recommendations above.",
  ].join("\n");
  const { annotation } = resolveOn([
    "# Spec",
    "- **APPROVED** — implement the recommendations above.",
    "- **APPROVED WITH CHANGES** — annotate the exact recommendation or surface",
    "  classification that changes before implementation.",
    "- **REJECTED** — retain the current contracts.",
  ].join("\n"), anchor, 3, 4);
  assert.equal(annotation.anchorState, "moved");
  assert.equal(annotation.anchor?.lineStart, 3);
  assert.equal(annotation.anchor?.lineEnd, 4);
});

test("deleted source stays not-found and exportable", () => {
  const { document, review, annotation } = resolveOn("# Spec\nKeep this line\n", "Delete me entirely");
  assert.equal(annotation.anchorState, "not-found");
  assert.equal(annotation.anchor?.lineStart, null);
  const markdown = exportReviewMarkdown(document, review);
  assert.match(markdown, /Use the intended source/);
  assert.match(markdown, /anchor not found/);
  assert.match(markdown, /Selected text omitted/);
});

test("two equally plausible heading retitles stay ambiguous", () => {
  const { annotation } = resolveOn(
    "# Spec\n## Shared Topic Alpha\n## Shared Topic Beta\n",
    "## Shared Topic",
  );
  assert.equal(annotation.anchorState, "ambiguous");
  assert.equal(annotation.anchor?.lineStart, null);
});

test("duplicate section titles do not merge fragments across a heading", () => {
  const alpha = "Unique alpha sentence lives here and is long enough for a fragment.";
  const beta = "Unique bravo sentence lives here and is long enough for a fragment.";
  const { annotation } = resolveOn([
    "# Spec",
    "## Example",
    alpha,
    "## Example",
    beta,
  ].join("\n"), `${alpha}\n${beta}`, 3, 3);
  assert.equal(annotation.anchorState, "ambiguous");
  assert.equal(annotation.anchor?.lineStart, null);
});
