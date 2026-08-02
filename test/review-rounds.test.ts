import assert from "node:assert/strict";
import { chmod, mkdtemp, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ReviewRoundStore } from "../src/application/round-ports.ts";
import { ReviewSessionWaiter, type ReviewCompletion } from "../src/application/review-session.ts";
import { ReviewerService } from "../src/application/reviewer-service.ts";
import { AppError } from "../src/domain/errors.ts";
import { contentDigest, pathKey } from "../src/domain/ids.ts";
import type { ReviewRound, RoundBaseline } from "../src/domain/review-round.ts";
import { FileDocumentReader } from "../src/infrastructure/file-document-reader.ts";
import { JsonReviewRoundStore } from "../src/infrastructure/json-review-round-store.ts";
import { JsonReviewStore } from "../src/infrastructure/json-review-store.ts";

async function fresh(rounds?: ReviewRoundStore) {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-rounds-"));
  const path = join(dir, "spec.md");
  const storageDir = join(dir, "store");
  await writeFile(path, "# Spec\n\nVersion A\n", "utf8");
  const reviews = new JsonReviewStore(storageDir);
  const roundStore = rounds ?? new JsonReviewRoundStore(storageDir);
  const service = new ReviewerService(new FileDocumentReader(), reviews, roundStore);
  return { dir, path, storageDir, reviews, roundStore, service };
}

async function finish(service: ReviewerService, waiter: ReviewSessionWaiter, path: string, delta = 0): Promise<ReviewCompletion> {
  return waiter.runTerminal(path, delta, async (terminal) => ({
    status: "finished" as const,
    path,
    ...await service.finishReview(path, terminal),
  }));
}

test("Finish commits private immutable rounds and opens the latest red-green comparison", async () => {
  const ctx = await fresh();
  const first = await finish(ctx.service, new ReviewSessionWaiter(ctx.path), ctx.path, 100);
  assert.equal(first.activeMs, 100);
  const roundDir = join(ctx.storageDir, "rounds", pathKey(ctx.path));
  const firstNames = (await readdir(roundDir)).filter((name) => name.endsWith(".json"));
  assert.equal(firstNames.length, 1);
  assert.equal((await stat(roundDir)).mode & 0o777, 0o700);
  assert.equal((await stat(join(roundDir, firstNames[0]!))).mode & 0o777, 0o600);
  assert.equal((await readdir(roundDir)).some((name) => name.startsWith(".")), false);

  await writeFile(ctx.path, "# Spec\n\nVersion B\nAdded\n", "utf8");
  const opened = await ctx.service.openDocument(ctx.path);
  assert.equal(opened.comparison.state, "diff");
  if (opened.comparison.state === "diff") {
    assert.equal(opened.comparison.added, 2);
    assert.equal(opened.comparison.removed, 1);
    assert.equal(opened.comparison.rows.some((row) => row.kind === "add" && row.text === "Added"), true);
  }

  await finish(ctx.service, new ReviewSessionWaiter(ctx.path), ctx.path, 50);
  assert.equal((await ctx.service.openDocument(ctx.path)).comparison.state, "unchanged");
  assert.equal((await readdir(roundDir)).filter((name) => name.endsWith(".json")).length, 2);
  const cancelWaiter = new ReviewSessionWaiter(ctx.path);
  await cancelWaiter.runTerminal(ctx.path, 25, async (terminal) => ({
    status: "canceled" as const,
    path: ctx.path,
    reason: null,
    activeMs: await ctx.service.cancelReview(ctx.path, terminal),
  }));
  assert.equal((await readdir(roundDir)).filter((name) => name.endsWith(".json")).length, 2);
});

test("a pre-commit failure retries one delta and one edited round", async () => {
  const delegateDir = await mkdtemp(join(tmpdir(), "spec-reviewer-round-delegate-"));
  const delegate = new JsonReviewRoundStore(join(delegateDir, "store"));
  const failing = new FailingRoundStore(delegate, "before");
  const ctx = await fresh(failing);
  const waiter = new ReviewSessionWaiter(ctx.path);
  await assert.rejects(finish(ctx.service, waiter, ctx.path, 250), (error) => {
    return error instanceof AppError && error.code === "storage_write_failed";
  });
  assert.equal((await ctx.reviews.load(ctx.path))?.metrics.activeMs, 250);
  await ctx.service.saveReview({
    path: ctx.path,
    baseRevision: 0,
    annotations: [{ lineStart: 3, lineEnd: 3, kind: "note", severity: "note", note: "After retry" }],
  });
  const completion = await finish(ctx.service, waiter, ctx.path, 999);
  assert.equal(completion.activeMs, 250);
  assert.match(completion.status === "finished" ? completion.markdown : "", /After retry/);
  assert.equal(failing.committedIds.length, 1);
});

test("a post-commit failure returns the stored round instead of rebuilding edited state", async () => {
  const delegateDir = await mkdtemp(join(tmpdir(), "spec-reviewer-round-delegate-"));
  const delegate = new JsonReviewRoundStore(join(delegateDir, "store"));
  const failing = new FailingRoundStore(delegate, "after");
  const ctx = await fresh(failing);
  const waiter = new ReviewSessionWaiter(ctx.path);
  await assert.rejects(finish(ctx.service, waiter, ctx.path, 100), (error) => {
    return error instanceof AppError && error.code === "storage_commit_indeterminate";
  });
  await ctx.service.saveReview({
    path: ctx.path,
    baseRevision: 0,
    annotations: [{ lineStart: 3, lineEnd: 3, kind: "note", severity: "note", note: "Too late" }],
  });
  const completion = await finish(ctx.service, waiter, ctx.path, 500);
  assert.equal(completion.activeMs, 100);
  assert.doesNotMatch(completion.status === "finished" ? completion.markdown : "", /Too late/);
  assert.equal(failing.committedIds.length, 1);
});

test("Finish preserves the saved review digest and stale-source warning", async () => {
  const ctx = await fresh();
  const opened = await ctx.service.openDocument(ctx.path);
  await ctx.service.saveReview({
    path: ctx.path,
    baseRevision: opened.review.revision,
    annotations: [{ lineStart: 3, lineEnd: 3, kind: "issue", severity: "major", note: "Review version A" }],
  });
  const reviewedDigest = opened.document.digest;
  const changed = "# Spec\n\nVersion B\n";
  await writeFile(ctx.path, changed, "utf8");
  const completion = await finish(ctx.service, new ReviewSessionWaiter(ctx.path), ctx.path);
  assert.equal(completion.status, "finished");
  if (completion.status !== "finished") return;
  assert.match(completion.markdown, new RegExp(`Digest: ${reviewedDigest}`));
  assert.match(completion.markdown, /Warning: this file changed after these notes were saved/);
  assert.match(completion.markdown, new RegExp(`Current digest: ${contentDigest(changed)}`));
  const round = await ctx.roundStore.loadLatest(ctx.path);
  assert.equal(round.state, "ready");
  if (round.state !== "ready") return;
  assert.equal(round.round.reviewDigest, reviewedDigest);
  assert.equal(round.round.documentDigest, contentDigest(changed));
});

test("a corrupt latest baseline degrades comparison without bricking review work", async () => {
  const ctx = await fresh();
  await finish(ctx.service, new ReviewSessionWaiter(ctx.path), ctx.path);
  const roundDir = join(ctx.storageDir, "rounds", pathKey(ctx.path));
  const filename = (await readdir(roundDir)).find((name) => name.endsWith(".json"));
  assert.ok(filename);
  await chmod(join(roundDir, filename), 0o600);
  await writeFile(join(roundDir, filename), "{broken", "utf8");
  const opened = await ctx.service.openDocument(ctx.path);
  assert.deepEqual(opened.comparison, { state: "unavailable", reason: "baseline-unavailable" });
  const saved = await ctx.service.saveReview({
    path: ctx.path,
    baseRevision: 0,
    annotations: [{ lineStart: 1, lineEnd: 1, kind: "note", severity: "note", note: "Still usable" }],
  });
  assert.equal(saved.annotations.length, 1);
  assert.match((await ctx.service.exportReview(ctx.path)).markdown, /Still usable/);
});

class FailingRoundStore implements ReviewRoundStore {
  readonly committedIds: string[] = [];
  private failed = false;
  private readonly delegate: ReviewRoundStore;
  private readonly point: "before" | "after";

  constructor(delegate: ReviewRoundStore, point: "before" | "after") {
    this.delegate = delegate;
    this.point = point;
  }

  loadLatest(path: string): Promise<RoundBaseline> { return this.delegate.loadLatest(path); }
  loadCommitted(path: string, id: string): Promise<ReviewRound | null> { return this.delegate.loadCommitted(path, id); }

  async commit(round: ReviewRound): Promise<ReviewRound | null> {
    if (!this.failed && this.point === "before") {
      this.failed = true;
      throw new AppError("storage_write_failed", 500, "injected pre-commit failure");
    }
    const committed = await this.delegate.commit(round);
    if (committed == null) return null;
    this.committedIds.push(committed.id);
    if (!this.failed && this.point === "after") {
      this.failed = true;
      throw new AppError("storage_commit_indeterminate", 500, "injected post-commit failure");
    }
    return committed;
  }
}
