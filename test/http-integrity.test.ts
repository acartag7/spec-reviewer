import assert from "node:assert/strict";
import { mkdir, mkdtemp, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ReviewerService } from "../src/application/reviewer-service.ts";
import { ReviewSessionWaiter } from "../src/application/review-session.ts";
import type { AppConfig } from "../src/config.ts";
import { pathKey } from "../src/domain/ids.ts";
import { FileDocumentReader } from "../src/infrastructure/file-document-reader.ts";
import { JsonReviewStore } from "../src/infrastructure/json-review-store.ts";
import { JsonReviewRoundStore } from "../src/infrastructure/json-review-round-store.ts";
import { createHttpServer } from "../src/interfaces/http/http-server.ts";

async function setup(wait: boolean) {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-http-integrity-"));
  const path = join(dir, "spec.md");
  await writeFile(path, "# Spec\n\nSource line\n", "utf8");
  const config: AppConfig = {
    command: "review",
    host: "127.0.0.1",
    port: 0,
    storageDir: join(dir, "store"),
    defaultDocumentPath: wait ? path : null,
    sessionId: null,
    skillArgs: [],
    waitForReview: wait,
    jsonOutput: false,
    openBrowser: false,
    source: { maxFileLines: 250 },
  };
  const store = new JsonReviewStore(config.storageDir);
  const service = new ReviewerService(new FileDocumentReader(), store, new JsonReviewRoundStore(config.storageDir));
  const waiter = wait ? new ReviewSessionWaiter(path) : null;
  const server = createHttpServer(config, service, join(process.cwd(), "public"), waiter);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("server did not bind");
  return { dir, path, config, store, waiter, server, base: `http://127.0.0.1:${address.port}` };
}

function post(body: unknown): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

async function responseJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json() as {
    error?: { code: string; message: string; details?: Record<string, string> };
    status?: string;
    activeMs?: number;
    [key: string]: unknown;
  };
  return { status: response.status, body };
}

test("HTTP rejects malformed JSON and stale revisions with typed fixed errors", async (t) => {
  const ctx = await setup(false);
  t.after(() => ctx.server.close());
  const malformed = await responseJson(`${ctx.base}/api/review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{ malformed",
  });
  assert.deepEqual(malformed, {
    status: 400,
    body: { error: { code: "invalid_json", message: "JSON body is malformed" } },
  });

  const first = await responseJson(`${ctx.base}/api/review`, post({
    path: ctx.path,
    baseRevision: 0,
    summary: "newer",
    annotations: [],
  }));
  assert.equal(first.status, 200);
  const stale = await responseJson(`${ctx.base}/api/review`, post({
    path: ctx.path,
    baseRevision: 0,
    summary: "stale",
  }));
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error?.code, "review_conflict");
  assert.equal((await ctx.store.load(ctx.path))?.summary, "newer");
});

test("HTTP path binding blocks the wrong document and cancel survives a missing source", async (t) => {
  const ctx = await setup(true);
  t.after(() => ctx.server.close());
  const other = join(ctx.dir, "other.md");
  await writeFile(other, "# Other\n", "utf8");
  const wrong = await responseJson(`${ctx.base}/api/session/finish`, post({ path: other, activeMsDelta: 900 }));
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.error?.code, "session_path_mismatch");
  assert.equal(ctx.waiter?.status, "waiting");
  assert.equal(await ctx.store.load(other), null);

  await unlink(ctx.path);
  const canceled = await responseJson(`${ctx.base}/api/session/cancel`, post({ path: ctx.path, activeMsDelta: 1500 }));
  assert.equal(canceled.status, 200);
  assert.equal(canceled.body.status, "canceled");
  assert.equal(canceled.body.activeMs, 1500);
  assert.equal(ctx.waiter?.status, "canceled");
  assert.equal(await ctx.store.load(ctx.path), null);
});

test("HTTP recent listing fails closed on corrupt storage without parser details", async (t) => {
  const ctx = await setup(false);
  t.after(() => ctx.server.close());
  const id = pathKey(ctx.path);
  const reviewsDir = join(ctx.config.storageDir, "reviews");
  await mkdir(reviewsDir, { recursive: true });
  await writeFile(join(reviewsDir, `${id}.json`), "{ malformed", "utf8");
  const result = await responseJson(`${ctx.base}/api/reviews`);
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, {
    error: {
      code: "review_store_corrupt",
      message: "Stored review is malformed",
      details: { filename: `${id}.json` },
    },
  });
  assert.doesNotMatch(JSON.stringify(result.body), /Unexpected token|malformed at position/i);
});

test("HTTP API 404 responses use the typed error envelope", async (t) => {
  const ctx = await setup(false);
  t.after(() => ctx.server.close());
  const result = await responseJson(`${ctx.base}/api/unknown`);
  assert.deepEqual(result, {
    status: 404,
    body: { error: { code: "not_found", message: "Not found" } },
  });
});
