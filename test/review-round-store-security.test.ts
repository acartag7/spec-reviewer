import assert from "node:assert/strict";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AppError } from "../src/domain/errors.ts";
import { contentDigest, pathKey } from "../src/domain/ids.ts";
import { createEmptyReview } from "../src/domain/review.ts";
import { createReviewRound, MAX_STORED_ROUND_BYTES, type ReviewRound } from "../src/domain/review-round.ts";
import { publishPrivateFileNoReplace } from "../src/infrastructure/immutable-private-file.ts";
import { JsonReviewRoundStore } from "../src/infrastructure/json-review-round-store.ts";

async function fresh() {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-round-security-"));
  const storageDir = join(dir, "store");
  const documentPath = join(dir, "spec.md");
  return { dir, storageDir, documentPath, store: new JsonReviewRoundStore(storageDir) };
}

function roundFor(path: string, epoch = 1_750_000_000_000, source = "# Spec\n"): ReviewRound {
  const review = createEmptyReview(path, contentDigest(source));
  return createReviewRound({
    id: `${epoch}-${epoch.toString(16).padStart(32, "0")}`,
    completedAt: new Date(epoch).toISOString(),
  }, source, contentDigest(source), review);
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error) => error instanceof AppError && error.code === code);
}

test("storage-root and path-key directory symlinks fail closed", async () => {
  const root = await fresh();
  const rootTarget = join(root.dir, "root-target");
  await mkdir(rootTarget, { mode: 0o700 });
  await symlink(rootTarget, root.storageDir);
  await expectCode(root.store.commit(roundFor(root.documentPath)), "storage_path_unsafe");

  const child = await fresh();
  const rounds = join(child.storageDir, "rounds");
  const childTarget = join(child.dir, "child-target");
  await mkdir(rounds, { recursive: true, mode: 0o700 });
  await mkdir(childTarget, { mode: 0o700 });
  await symlink(childTarget, join(rounds, pathKey(child.documentPath)));
  await expectCode(child.store.commit(roundFor(child.documentPath)), "storage_path_unsafe");
});

test("existing real storage directories are readable then tightened before a round write", async () => {
  const ctx = await fresh();
  const rounds = join(ctx.storageDir, "rounds");
  const directory = join(rounds, pathKey(ctx.documentPath));
  await mkdir(directory, { recursive: true, mode: 0o755 });
  for (const path of [ctx.storageDir, rounds, directory]) await chmod(path, 0o755);
  const round = roundFor(ctx.documentPath);
  assert.equal(await ctx.store.loadCommitted(ctx.documentPath, round.id), null);
  assert.deepEqual(await ctx.store.loadLatest(ctx.documentPath), { state: "none", reason: "no-baseline" });
  for (const path of [ctx.storageDir, rounds, directory]) assert.equal((await stat(path)).mode & 0o777, 0o755);
  await ctx.store.commit(round);
  for (const path of [ctx.storageDir, rounds, directory]) assert.equal((await stat(path)).mode & 0o777, 0o700);
});

test("immutable publication neither follows a temp symlink nor overwrites a final collision", async () => {
  const directory = await mkdtemp(join(tmpdir(), "spec-reviewer-publish-"));
  const filename = "1750000000000-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json";
  const outside = join(directory, "outside");
  const temporary = join(directory, `.${filename}.fixed.tmp`);
  await writeFile(outside, "outside", { mode: 0o600 });
  await symlink(outside, temporary);
  await expectCode(
    publishPrivateFileNoReplace(directory, filename, "new", { temporaryToken: "fixed" }),
    "storage_write_failed",
  );
  assert.equal(await readFile(outside, "utf8"), "outside");
  assert.equal((await lstat(temporary)).isSymbolicLink(), true);

  await writeFile(join(directory, filename), "original", { mode: 0o600 });
  assert.equal(await publishPrivateFileNoReplace(directory, filename, "replacement"), false);
  assert.equal(await readFile(join(directory, filename), "utf8"), "original");
  await expectCode(publishPrivateFileNoReplace(directory, "..", "escape"), "storage_write_failed");
});

test("a symlinked Finish lock is not followed or broken", async () => {
  const ctx = await fresh();
  await ctx.store.commit(roundFor(ctx.documentPath));
  const directory = join(ctx.storageDir, "rounds", pathKey(ctx.documentPath));
  const outside = join(ctx.dir, "lock-target");
  await writeFile(outside, "owned", { mode: 0o600 });
  await symlink(outside, join(directory, ".finish.lock"));
  await expectCode(ctx.store.commit(roundFor(ctx.documentPath, 1_750_000_000_001)), "round_store_busy");
  assert.equal(await readFile(outside, "utf8"), "owned");
});

test("path, filename, timestamp, schema, digest, annotation, and size mismatches fail reads", async () => {
  const mutations: Array<(record: Record<string, unknown>) => void> = [
    (record) => { record.documentPath = "/different/spec.md"; },
    (record) => { record.completedAt = "2025-06-15T15:06:41.000Z"; },
    (record) => { record.schemaVersion = 2; },
    (record) => { record.id = `1750000000001-${"b".repeat(32)}`; },
    (record) => { record.sourceText = "# Tampered\n"; },
    (record) => { record.annotations = "invalid"; },
  ];
  for (const mutate of mutations) {
    const ctx = await fresh();
    const round = roundFor(ctx.documentPath);
    await ctx.store.commit(round);
    const file = join(ctx.storageDir, "rounds", pathKey(ctx.documentPath), `${round.id}.json`);
    const record = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    mutate(record);
    await writeFile(file, JSON.stringify(record), "utf8");
    assert.deepEqual(await ctx.store.loadLatest(ctx.documentPath), { state: "unavailable", reason: "baseline-unavailable" });
    await expectCode(ctx.store.loadCommitted(ctx.documentPath, round.id), "round_store_corrupt");
  }

  const oversized = await fresh();
  const round = roundFor(oversized.documentPath);
  await oversized.store.commit(round);
  const file = join(oversized.storageDir, "rounds", pathKey(oversized.documentPath), `${round.id}.json`);
  await writeFile(file, "x".repeat(MAX_STORED_ROUND_BYTES + 1), "utf8");
  assert.deepEqual(await oversized.store.loadLatest(oversized.documentPath), { state: "unavailable", reason: "baseline-unavailable" });
  await expectCode(oversized.store.loadCommitted(oversized.documentPath, round.id), "round_store_corrupt");
});

test("round files remain exactly 0600 under a restrictive umask", async () => {
  const ctx = await fresh();
  const previous = process.umask(0o277);
  try {
    const round = roundFor(ctx.documentPath);
    await ctx.store.commit(round);
    const file = join(ctx.storageDir, "rounds", pathKey(ctx.documentPath), `${round.id}.json`);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
  } finally {
    process.umask(previous);
  }
});

test("content-addressed uploads do not create unreadable round history", async () => {
  const ctx = await fresh();
  const uploaded = join(ctx.storageDir, "documents", "digest-spec.md");
  assert.equal(await ctx.store.commit(roundFor(uploaded)), null);
  await assert.rejects(readdir(ctx.storageDir), { code: "ENOENT" });
});
