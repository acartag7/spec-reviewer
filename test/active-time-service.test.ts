import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
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
test("concurrent saveReview and addActiveTime serialize path aliases without lost updates", async () => {
  const { service, store, docPath } = await freshService();
  const relativePath = relative(process.cwd(), docPath);
  for (let i = 0; i < 20; i++) {
    await Promise.all([
      service.saveReview({ path: relativePath, annotations: [{ lineStart: 1, lineEnd: 1, kind: "note", severity: "note", note: `n${i}` }], activeMsDelta: 1000 }),
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

test("application-layer partial saves preserve annotations and reject wrong types", async () => {
  const { service, store, docPath } = await freshService();
  await service.saveReview({
    path: docPath,
    annotations: [{ lineStart: 3, lineEnd: 3, kind: "issue", severity: "major", note: "Keep this" }],
  });

  await service.saveReview({ path: docPath, summary: "Summary only" });
  const stored = await store.load(docPath);
  assert.equal(stored?.summary, "Summary only");
  assert.equal(stored?.annotations.length, 1);
  await assert.rejects(service.saveReview({ path: docPath, annotations: null }), /annotations must be an array/);
});

test("export waits for an in-flight review save", async () => {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-"));
  const docPath = join(dir, "README.md");
  await writeFile(docPath, "# Doc\n\nBody line\n", "utf8");
  class DelayedStore extends JsonReviewStore {
    override async save(review: Parameters<JsonReviewStore["save"]>[0]): Promise<void> {
      await new Promise((resolve) => setTimeout(resolve, 25));
      await super.save(review);
    }
  }
  const service = new ReviewerService(new FileDocumentReader(), new DelayedStore(join(dir, "store")));
  const saving = service.saveReview({
    path: docPath,
    annotations: [{ lineStart: 3, lineEnd: 3, kind: "issue", severity: "major", note: "Last note" }],
  });
  const exported = await service.exportReview(docPath);
  await saving;
  assert.match(exported.markdown, /Last note/);
});
