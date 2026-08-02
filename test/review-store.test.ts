import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readdir, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AppError } from "../src/domain/errors.ts";
import { contentDigest, pathKey } from "../src/domain/ids.ts";
import { createEmptyReview, type Review } from "../src/domain/review.ts";
import { JsonReviewStore } from "../src/infrastructure/json-review-store.ts";
import { storeUploadedMarkdown } from "../src/interfaces/http/uploads.ts";

async function fresh() {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-store-"));
  const storageDir = join(dir, "store");
  const documentPath = join(dir, "spec.md");
  const review = createEmptyReview(documentPath, contentDigest("# Spec\n"));
  return { dir, storageDir, documentPath, review, store: new JsonReviewStore(storageDir) };
}

function present<T>(value: T | undefined): T {
  assert.ok(value);
  return value;
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<AppError> {
  let found: AppError | null = null;
  await assert.rejects(promise, (error) => {
    if (error instanceof AppError && error.code === code) found = error;
    return found != null;
  });
  return found!;
}

test("review and upload writes are private, atomic, and leave no temporary files", async () => {
  const { storageDir, review, store } = await fresh();
  await store.save(review);
  const reviewsDir = join(storageDir, "reviews");
  const entries = await readdir(reviewsDir);
  assert.deepEqual(entries, [`${pathKey(review.documentPath)}.json`]);
  assert.equal((await stat(reviewsDir)).mode & 0o777, 0o700);
  assert.equal((await stat(join(reviewsDir, present(entries[0])))).mode & 0o777, 0o600);

  const uploaded = await storeUploadedMarkdown(storageDir, "../name with spaces.md", "# Upload\n");
  assert.equal((await stat(join(storageDir, "documents"))).mode & 0o777, 0o700);
  assert.equal((await stat(uploaded)).mode & 0o777, 0o600);
  assert.equal((await readdir(join(storageDir, "documents"))).some((name) => name.endsWith(".tmp")), false);
});

test("invalid content is rejected before storage directories are created", async () => {
  const { storageDir, review, store } = await fresh();
  const invalid = { ...review, documentDigest: "bad" } as Review;
  await expectCode(store.save(invalid), "review_store_corrupt");
  await assert.rejects(lstat(join(storageDir, "reviews")), { code: "ENOENT" });
  await assert.rejects(storeUploadedMarkdown(storageDir, "bad.txt", "text"));
  await assert.rejects(lstat(join(storageDir, "documents")), { code: "ENOENT" });
});

test("a symlinked storage subdirectory fails closed", async () => {
  const { dir, storageDir, review, store } = await fresh();
  const target = join(dir, "elsewhere");
  await mkdir(storageDir, { recursive: true });
  await mkdir(target);
  await symlink(target, join(storageDir, "reviews"));
  await expectCode(store.save(review), "storage_path_unsafe");
  assert.deepEqual(await readdir(target), []);
});

test("all store read paths reject malformed JSON with a fixed filename-only error", async () => {
  const { storageDir, documentPath, store } = await fresh();
  const id = pathKey(documentPath);
  const reviewsDir = join(storageDir, "reviews");
  await mkdir(reviewsDir, { recursive: true });
  await writeFile(join(reviewsDir, `${id}.json`), "{ malformed", "utf8");

  for (const operation of [store.load(documentPath), store.loadById(id), store.listRecent(20)]) {
    const error = await expectCode(operation, "review_store_corrupt");
    assert.deepEqual(error.details, { filename: `${id}.json` });
    assert.equal(error.message, "Stored review is malformed");
  }
});

test("recent listing rejects a valid record stored under the wrong key", async () => {
  const { storageDir, review, store } = await fresh();
  const reviewsDir = join(storageDir, "reviews");
  const wrongId = "0".repeat(32);
  await mkdir(reviewsDir, { recursive: true });
  await writeFile(join(reviewsDir, `${wrongId}.json`), JSON.stringify(review), "utf8");
  const error = await expectCode(store.listRecent(20), "review_store_corrupt");
  assert.deepEqual(error.details, { filename: `${wrongId}.json` });
});

test("legacy records migrate metadata and preserve formerly accepted client fields", async () => {
  const { storageDir, review, store } = await fresh();
  const { revision: _revision, metrics: _metrics, ...legacy } = review;
  const oldAnnotation = {
    id: "legacy",
    lineStart: 1,
    lineEnd: 1,
    section: null,
    selectedText: "selected",
    kind: "issue",
    severity: "major",
    status: "open",
    note: "note",
    agentAction: "action",
    createdAt: "created",
    updatedAt: "later",
    anchorText: "anchor",
  };
  const annotations = Array.from({ length: 201 }, (_, index) => ({
    ...oldAnnotation,
    id: `legacy-${index}`,
  }));
  present(annotations[0]).id = "x".repeat(129);
  present(annotations[0]).createdAt = "whenever";
  present(annotations[1]).selectedText = "s".repeat(65_537);
  present(annotations[2]).note = "n".repeat(65_537);
  present(annotations[3]).agentAction = "a".repeat(65_537);
  present(annotations[4]).anchorText = "s".repeat(65_537);
  const reviewsDir = join(storageDir, "reviews");
  await mkdir(reviewsDir, { recursive: true });
  await writeFile(join(reviewsDir, `${pathKey(review.documentPath)}.json`), JSON.stringify({
    ...legacy,
    summary: "s".repeat(65_537),
    annotations,
  }), "utf8");
  const loaded = await store.load(review.documentPath);
  assert.equal(loaded?.revision, 0);
  assert.deepEqual(loaded?.metrics, { activeMs: 0 });
  assert.equal(loaded?.annotations.length, 201);
  assert.equal(loaded?.annotations.at(0)?.createdAt, "whenever");
  assert.equal((await store.listRecent(1)).at(0)?.activeMs, 0);
  await store.save(loaded!);
  assert.equal((await store.load(review.documentPath))?.annotations.length, 201);
});
