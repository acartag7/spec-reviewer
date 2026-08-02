import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ReviewerService } from "../src/application/reviewer-service.ts";
import { ReviewSessionWaiter, type ReviewCompletion } from "../src/application/review-session.ts";
import { AppError } from "../src/domain/errors.ts";
import { FileDocumentReader } from "../src/infrastructure/file-document-reader.ts";
import { JsonReviewStore } from "../src/infrastructure/json-review-store.ts";

const path = "/tmp/session-spec.md";

function finished(): ReviewCompletion {
  return { status: "finished", path, markdown: "done", openAnnotations: 0, carriedOver: 0, activeMs: 100 };
}

test("a path mismatch cannot run or complete a waiting session", async () => {
  const waiter = new ReviewSessionWaiter(path);
  let calls = 0;
  assert.throws(
    () => waiter.runTerminal("/tmp/other.md", 100, async () => {
      calls += 1;
      return finished();
    }),
    (error) => error instanceof AppError && error.code === "session_path_mismatch",
  );
  assert.equal(calls, 0);
  assert.equal(waiter.status, "waiting");
  assert.throws(() => waiter.finish("/tmp/other.md", "wrong"), (error) => {
    return error instanceof AppError && error.code === "session_path_mismatch";
  });
});

test("concurrent terminal requests share the first result and consume one delta", async () => {
  const waiter = new ReviewSessionWaiter(path);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const deltas: unknown[] = [];
  const first = waiter.runTerminal(path, 100, async (delta) => {
    deltas.push(delta);
    await gate;
    return finished();
  });
  const second = waiter.runTerminal(path, 200, async () => {
    throw new Error("the second operation must not run");
  });
  assert.equal(first, second);
  release();
  assert.deepEqual(await Promise.all([first, second]), [finished(), finished()]);
  assert.deepEqual(deltas, [100]);
  assert.equal(waiter.status, "finished");
});

test("a failed terminal attempt releases the claim but never reapplies its delta", async () => {
  const waiter = new ReviewSessionWaiter(path);
  const deltas: unknown[] = [];
  await assert.rejects(waiter.runTerminal(path, 100, async (delta) => {
    deltas.push(delta);
    throw new Error("failed export");
  }));
  const result = await waiter.runTerminal(path, 200, async (delta) => {
    deltas.push(delta);
    return { status: "canceled", path, reason: "recover", activeMs: 0 };
  });
  assert.equal(result.status, "canceled");
  assert.deepEqual(deltas, [100, undefined]);
});

test("cancel can finish a missing-source session without creating invalid state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-cancel-"));
  const missing = join(dir, "missing.md");
  const store = new JsonReviewStore(join(dir, "store"));
  const service = new ReviewerService(new FileDocumentReader(), store);
  assert.equal(await service.cancelReview(missing, 1500), 1500);
  assert.equal(await store.load(missing), null);
});
