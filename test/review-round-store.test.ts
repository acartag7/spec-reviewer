import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AppError } from "../src/domain/errors.ts";
import { contentDigest, pathKey } from "../src/domain/ids.ts";
import { createEmptyReview } from "../src/domain/review.ts";
import { createReviewRound, type ReviewRound } from "../src/domain/review-round.ts";
import { JsonReviewRoundStore } from "../src/infrastructure/json-review-round-store.ts";

async function fresh() {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-round-store-"));
  const storageDir = join(dir, "store");
  const documentPath = join(dir, "spec.md");
  return { dir, storageDir, documentPath, store: new JsonReviewRoundStore(storageDir) };
}

function roundFor(path: string, epoch: number, source = "# Spec\n"): ReviewRound {
  const review = createEmptyReview(path, contentDigest(source));
  return createReviewRound({
    id: `${epoch}-${epoch.toString(16).padStart(32, "0")}`,
    completedAt: new Date(epoch).toISOString(),
  }, source, contentDigest(source), review);
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error) => error instanceof AppError && error.code === code);
}

test("round input rejects traversal IDs before creating storage", async () => {
  const ctx = await fresh();
  const round = { ...roundFor(ctx.documentPath, 1_750_000_000_000), id: "../../etc/passwd" };
  await expectCode(ctx.store.commit(round), "round_store_corrupt");
  await assert.rejects(readdir(ctx.storageDir), { code: "ENOENT" });
});

test("symlinked round directories and final files fail closed", async () => {
  const ctx = await fresh();
  const target = join(ctx.dir, "elsewhere");
  await mkdir(ctx.storageDir, { mode: 0o700 });
  await mkdir(target, { mode: 0o700 });
  await symlink(target, join(ctx.storageDir, "rounds"));
  await expectCode(ctx.store.commit(roundFor(ctx.documentPath, 1_750_000_000_000)), "storage_path_unsafe");
  assert.deepEqual(await ctx.store.loadLatest(ctx.documentPath), { state: "unavailable", reason: "baseline-unavailable" });

  const clean = await fresh();
  await clean.store.commit(roundFor(clean.documentPath, 1_750_000_000_000));
  const directory = join(clean.storageDir, "rounds", pathKey(clean.documentPath));
  const collision = roundFor(clean.documentPath, 1_750_000_000_001);
  const outside = join(clean.dir, "outside.json");
  await writeFile(outside, JSON.stringify(collision), { mode: 0o600 });
  await symlink(outside, join(directory, `${collision.id}.json`));
  await expectCode(clean.store.commit(collision), "round_store_corrupt");
});

test("an existing valid identity is idempotent and never rebuilt", async () => {
  const ctx = await fresh();
  const original = roundFor(ctx.documentPath, 1_750_000_000_000, "# Original\n");
  await ctx.store.commit(original);
  const edited = { ...roundFor(ctx.documentPath, 1_750_000_000_000, "# Edited\n"), id: original.id, completedAt: original.completedAt };
  const result = await ctx.store.commit(edited);
  assert.ok(result);
  assert.equal(result.sourceText, "# Original\n");
  assert.equal((await ctx.store.loadCommitted(ctx.documentPath, original.id))?.sourceText, "# Original\n");
});

test("commit advances the persisted epoch when the clock moves backward across restarts", async () => {
  const ctx = await fresh();
  const future = roundFor(ctx.documentPath, 1_750_000_001_000, "# Future clock\n");
  const restarted = roundFor(ctx.documentPath, 1_750_000_000_000, "# Completed after restart\n");
  await ctx.store.commit(future);

  const committed = await ctx.store.commit(restarted);
  assert.ok(committed);
  assert.match(committed.id, /^1750000001001-/);
  assert.equal(committed.completedAt, new Date(1_750_000_001_001).toISOString());
  const latest = await ctx.store.loadLatest(ctx.documentPath);
  assert.equal(latest.state, "ready");
  if (latest.state === "ready") assert.equal(latest.round.sourceText, "# Completed after restart\n");
  assert.equal((await ctx.store.loadCommitted(ctx.documentPath, restarted.id))?.id, committed.id);
});

test("a stale Finish lock fails closed with a fixed busy error", async () => {
  const ctx = await fresh();
  await ctx.store.commit(roundFor(ctx.documentPath, 1_750_000_000_000));
  const directory = join(ctx.storageDir, "rounds", pathKey(ctx.documentPath));
  await writeFile(join(directory, ".finish.lock"), "", { mode: 0o600 });
  await assert.rejects(ctx.store.commit(roundFor(ctx.documentPath, 1_750_000_000_001)), (error) => {
    return error instanceof AppError
      && error.code === "round_store_busy"
      && error.message === "Another Finish may be active; if none is running, stop Spec Reviewer, remove the local .finish.lock file, and retry";
  });
});

test("the 101st committed round is rejected without eviction or a stale lock", async () => {
  const ctx = await fresh();
  const firstEpoch = 1_750_000_000_000;
  for (let index = 0; index < 100; index += 1) {
    await ctx.store.commit(roundFor(ctx.documentPath, firstEpoch + index));
  }
  await expectCode(ctx.store.commit(roundFor(ctx.documentPath, firstEpoch + 100)), "round_limit_reached");
  const directory = join(ctx.storageDir, "rounds", pathKey(ctx.documentPath));
  const entries = await readdir(directory);
  assert.equal(entries.filter((name) => name.endsWith(".json")).length, 100);
  assert.equal(entries.includes(".finish.lock"), false);
});

test("content-addressed uploads report their distinct unavailable reason", async () => {
  const ctx = await fresh();
  const uploaded = join(ctx.storageDir, "documents", "digest-spec.md");
  assert.deepEqual(await ctx.store.loadLatest(uploaded), { state: "none", reason: "immutable-upload" });
});
