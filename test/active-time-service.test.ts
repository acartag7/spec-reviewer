import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ReviewerService } from "../src/application/reviewer-service.ts";
import { FileDocumentReader } from "../src/infrastructure/file-document-reader.ts";
import { JsonReviewStore } from "../src/infrastructure/json-review-store.ts";

async function freshService(): Promise<{ service: ReviewerService; store: JsonReviewStore; docPath: string }> {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-"));
  const docPath = join(dir, "README.md");
  await writeFile(docPath, "# Doc\n\nBody line\n", "utf8");
  const store = new JsonReviewStore(join(dir, "store"));
  const service = new ReviewerService(new FileDocumentReader(), store);
  return { service, store, docPath };
}

// Race regression (P1): a passive active-time flush concurrent with a saveReview must not let either
// revert the other. Without per-path serialization, addActiveTime could load a stale snapshot and
// write it back, losing the just-saved annotations (or vice-versa for the metric).
test("concurrent saveReview and addActiveTime both persist (no lost updates)", async () => {
  const { service, store, docPath } = await freshService();
  for (let i = 0; i < 20; i++) {
    await Promise.all([
      service.saveReview({ path: docPath, annotations: [{ lineStart: 1, lineEnd: 1, kind: "note", severity: "note", note: `n${i}` }], activeMsDelta: 1000 }),
      service.addActiveTime(docPath, 500),
    ]);
    const review = await store.load(docPath);
    assert.notEqual(review, null);
    assert.equal(review!.annotations.length, 1, `iter ${i}: annotation lost to a racing write`);
    assert.equal(review!.metrics.activeMs, 1500 * (i + 1), `iter ${i}: active time lost to a racing write`);
  }
});

// Read-only regression (P2): a reviewer who only reads and finishes (never saves an annotation) must
// still record active time. addActiveTime creates the review on first delta instead of dropping it.
test("addActiveTime persists a review for a read-only session", async () => {
  const { service, store, docPath } = await freshService();
  const result = await service.addActiveTime(docPath, 45000);
  assert.equal(result.metrics.activeMs, 45000);
  const stored = await store.load(docPath);
  assert.notEqual(stored, null);
  assert.equal(stored!.metrics.activeMs, 45000);
  assert.equal(stored!.annotations.length, 0);
});
