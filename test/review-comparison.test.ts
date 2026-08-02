import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReviewComparison } from "../src/application/review-comparison.ts";
import { contentDigest } from "../src/domain/ids.ts";
import { createEmptyReview } from "../src/domain/review.ts";
import { createReviewRound } from "../src/domain/review-round.ts";

const path = "/tmp/spec.md";

function compare(before: string, after: string, limits = {}) {
  const epoch = 1_750_000_000_000;
  const review = createEmptyReview(path, contentDigest(before));
  const round = createReviewRound({
    id: `${epoch}-${"a".repeat(32)}`,
    completedAt: new Date(epoch).toISOString(),
  }, before, contentDigest(before), review);
  return buildReviewComparison(round, after, contentDigest(after), limits);
}

test("unified comparison classifies rows and old/new line numbers", () => {
  const result = compare("one\ntwo\nthree\n", "zero\none\nTWO\nthree\nlast\n");
  assert.equal(result.state, "diff");
  if (result.state !== "diff") return;
  assert.equal(result.added, 3);
  assert.equal(result.removed, 1);
  assert.deepEqual(result.rows.filter((row) => row.kind === "remove"), [
    { kind: "remove", oldLine: 2, newLine: null, text: "two" },
  ]);
  assert.deepEqual(result.rows.filter((row) => row.kind === "add"), [
    { kind: "add", oldLine: null, newLine: 1, text: "zero" },
    { kind: "add", oldLine: null, newLine: 3, text: "TWO" },
    { kind: "add", oldLine: null, newLine: 5, text: "last" },
  ]);
});

test("blank, first-line, last-line, insertion, deletion, and replacement totals stay exact", () => {
  const cases = [
    ["a\nb\n", "x\na\nb\n", 1, 0],
    ["a\nb\n", "a\nb\nx\n", 1, 0],
    ["a\n\nb\n", "a\nb\n", 0, 1],
    ["a\nb\n", "a\n\nb\n", 1, 0],
    ["a\nb\n", "a\nc\n", 1, 1],
    ["a\nb\n", "a\n", 0, 1],
  ] as const;
  for (const [before, after, added, removed] of cases) {
    const result = compare(before, after);
    assert.equal(result.state, "diff");
    if (result.state !== "diff") continue;
    assert.equal(result.added, added, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
    assert.equal(result.removed, removed, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  }
});

test("final-newline markers follow the affected side and empty-file edits do not invent markers", () => {
  const removed = compare("a\n", "a");
  assert.equal(removed.state, "diff");
  if (removed.state === "diff") {
    assert.equal(removed.added, 1);
    assert.equal(removed.removed, 1);
    assert.deepEqual(removed.rows.map((row) => row.kind), ["remove", "add", "no-newline"]);
  }
  const added = compare("a", "a\n");
  assert.equal(added.state, "diff");
  if (added.state === "diff") {
    assert.equal(added.added, 1);
    assert.equal(added.removed, 1);
    assert.deepEqual(added.rows.map((row) => row.kind), ["remove", "no-newline", "add"]);
  }
  for (const result of [compare("", "x\ny\n"), compare("x\ny\n", "")]) {
    assert.equal(result.state, "diff");
    if (result.state === "diff") assert.equal(result.rows.some((row) => row.kind === "no-newline"), false);
  }
  assert.equal(compare("a\r\nb\r\n", "a\nb\n").state, "unchanged");
});

test("distant edits have an explicit bounded collapsed gap", () => {
  const lines = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`);
  const changed = [...lines];
  changed[1] = "changed near start";
  changed[27] = "changed near end";
  const result = compare(`${lines.join("\n")}\n`, `${changed.join("\n")}\n`);
  assert.equal(result.state, "diff");
  if (result.state !== "diff") return;
  const gaps = result.rows.filter((row) => row.kind === "gap");
  assert.equal(gaps.length, 1);
  assert.deepEqual(gaps[0], { kind: "gap", hiddenOld: 19, hiddenNew: 19 });
});

test("line and edit-work bounds return too-large instead of running unbounded", () => {
  const lines = Array.from({ length: 10_001 }, (_, index) => `line ${index}`).join("\n");
  assert.equal(compare(`${lines}\n`, `${lines} changed\n`).state, "too-large");
  assert.equal(compare("a\n", "b\n", { maxEditLength: 0 }).state, "too-large");
  assert.equal(compare("a\n", "b\n", { timeoutMs: -1 }).state, "too-large");
});
