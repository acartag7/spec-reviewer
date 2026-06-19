import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ReviewerService } from "../src/application/reviewer-service.ts";
import { ReviewSessionWaiter } from "../src/application/review-session.ts";
import {
  MAX_ACTIVE_MS,
  createEmptyReview,
  normalizeActiveMsDelta,
  normalizeMetrics,
  normalizeReviewDraft,
  type Review,
} from "../src/domain/review.ts";
import { pathKey } from "../src/domain/ids.ts";
import { FileDocumentReader } from "../src/infrastructure/file-document-reader.ts";
import { JsonReviewStore } from "../src/infrastructure/json-review-store.ts";
import { createHttpServer } from "../src/interfaces/http/http-server.ts";
import type { AppConfig } from "../src/config.ts";

// Active reviewing time accumulates on Review.metrics.activeMs. The client sends only a delta;
// the server owns the running total. Tests below cover the pure normalization AND the full HTTP
// round-trip (accumulation across saves, finish/cancel flush, on-disk invariants, migration).

// ---------- pure domain normalization ----------

test("normalizeMetrics: old file with no metrics starts at zero", () => {
  assert.deepEqual(normalizeMetrics(undefined, undefined), { activeMs: 0 });
});

test("normalizeMetrics: absent delta preserves the stored total (core carry invariant)", () => {
  assert.deepEqual(normalizeMetrics({ activeMs: 5000 }, undefined), { activeMs: 5000 });
  assert.deepEqual(normalizeMetrics({ activeMs: 5000 }, null), { activeMs: 5000 });
  assert.deepEqual(normalizeMetrics({ activeMs: 5000 }, ""), { activeMs: 5000 });
});

test("normalizeMetrics: accumulates a validated delta onto the stored total", () => {
  assert.deepEqual(normalizeMetrics({ activeMs: 5000 }, 7000), { activeMs: 12000 });
});

test("createEmptyReview: emits zeroed metrics", () => {
  assert.deepEqual(createEmptyReview("/tmp/x.md", "d").metrics, { activeMs: 0 });
});

test("normalizeReviewDraft: metrics survive a re-save with no activeMsDelta (T2)", () => {
  const previous: Review = {
    documentPath: "/tmp/x.md",
    documentDigest: "d",
    summary: "",
    annotations: [],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    metrics: { activeMs: 9000 },
  };
  const rebuilt = normalizeReviewDraft({ path: "/tmp/x.md" }, "d", () => null, () => null, previous);
  assert.equal(rebuilt.metrics.activeMs, 9000);
  const withDelta = normalizeReviewDraft({ path: "/tmp/x.md", activeMsDelta: 1000 }, "d", () => null, () => null, previous);
  assert.equal(withDelta.metrics.activeMs, 10000);
});

test("normalizeActiveMsDelta: coerces bad input to zero without throwing (T3)", () => {
  const badValues = [-5, NaN, Infinity, -Infinity, "abc", "  ", "", true, false, null, undefined, {}, [], () => 1];
  for (const bad of badValues) {
    assert.equal(normalizeActiveMsDelta(bad), 0, `expected 0 for ${JSON.stringify(bad)}`);
  }
  assert.equal(normalizeActiveMsDelta("3000"), 3000);
  assert.equal(normalizeActiveMsDelta(3500.9), 3500);
});

test("normalizeActiveMsDelta: clamps huge values to MAX_ACTIVE_MS", () => {
  assert.equal(normalizeActiveMsDelta(1e15), MAX_ACTIVE_MS);
  assert.equal(normalizeActiveMsDelta(MAX_ACTIVE_MS + 5000), MAX_ACTIVE_MS);
});

test("normalizeMetrics: bad delta over a baseline leaves the baseline intact", () => {
  const baseline = { activeMs: 3000 };
  const badValues = [-5, NaN, Infinity, "abc", true, null, {}, []];
  for (const bad of badValues) {
    assert.equal(normalizeMetrics(baseline, bad).activeMs, 3000, `baseline intact for ${JSON.stringify(bad)}`);
  }
  assert.equal(normalizeMetrics({ activeMs: MAX_ACTIVE_MS }, MAX_ACTIVE_MS).activeMs, MAX_ACTIVE_MS);
});

// ---------- HTTP integration ----------

interface Setup {
  dir: string;
  docPath: string;
  config: AppConfig;
  server: ReturnType<typeof createHttpServer>;
  waiter: ReviewSessionWaiter | null;
  base: string;
}

async function setup(wait: boolean): Promise<Setup> {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-"));
  const docPath = join(dir, "README.md");
  await writeFile(docPath, "# Demo\n\nSome content here\n", "utf8");
  const config: AppConfig = {
    host: "127.0.0.1",
    port: 0,
    storageDir: join(dir, "store"),
    defaultDocumentPath: docPath,
    sessionId: null,
    command: "review",
    waitForReview: wait,
    jsonOutput: false,
    openBrowser: false,
    source: { maxFileLines: 250 },
  };
  const service = new ReviewerService(new FileDocumentReader(), new JsonReviewStore(config.storageDir));
  const waiter = wait ? new ReviewSessionWaiter(docPath) : null;
  const server = createHttpServer(config, service, join(process.cwd(), "public"), waiter);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("server did not bind a port");
  return { dir, docPath, config, server, waiter, base: `http://127.0.0.1:${address.port}` };
}

function post(payload: object): RequestInit {
  return { method: "POST", body: JSON.stringify(payload), headers: { "content-type": "application/json" } };
}

async function json(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data;
}

const reviewFile = (ctx: Setup) => join(ctx.config.storageDir, "reviews", `${pathKey(ctx.docPath)}.json`);

test("accumulated active time persists to disk with 0o600 mode (T1/T1b)", async (t) => {
  const ctx = await setup(false);
  t.after(() => ctx.server.close());
  const note = { lineStart: 1, lineEnd: 1, kind: "note" as const, severity: "note" as const, note: "x" };
  await json(`${ctx.base}/api/review`, post({ path: ctx.docPath, activeMsDelta: 5000, annotations: [note] }));
  await json(`${ctx.base}/api/review`, post({ path: ctx.docPath, activeMsDelta: 7000, annotations: [note] }));
  const doc = await json(`${ctx.base}/api/document?path=${encodeURIComponent(ctx.docPath)}`);
  assert.equal(doc.review.metrics.activeMs, 12000);
  const raw = JSON.parse(await readFile(reviewFile(ctx), "utf8"));
  assert.equal(raw.metrics.activeMs, 12000);
  const st = await stat(reviewFile(ctx));
  assert.equal(st.mode & 0o777, 0o600);
});

test("a malformed body does not corrupt the stored review (T4)", async (t) => {
  const ctx = await setup(false);
  t.after(() => ctx.server.close());
  await json(`${ctx.base}/api/review`, post({ path: ctx.docPath, activeMsDelta: 3000, annotations: [{ lineStart: 1, lineEnd: 1, kind: "note", severity: "note", note: "keep" }] }));
  await assert.rejects(json(`${ctx.base}/api/review`, post({ path: ctx.docPath, activeMsDelta: 9999, annotations: [{ lineStart: "nope" }] })));
  const doc = await json(`${ctx.base}/api/document?path=${encodeURIComponent(ctx.docPath)}`);
  assert.equal(doc.review.metrics.activeMs, 3000);
  assert.equal(doc.review.annotations[0].note, "keep");
});

test("finish persists the final delta and echoes the total; second finish is idempotent (T5)", async (t) => {
  const ctx = await setup(true);
  t.after(() => ctx.server.close());
  await json(`${ctx.base}/api/review`, post({ path: ctx.docPath, activeMsDelta: 4000, annotations: [{ lineStart: 1, lineEnd: 1, kind: "note", severity: "note", note: "x" }] }));
  const finish1 = await json(`${ctx.base}/api/session/finish`, post({ path: ctx.docPath, activeMsDelta: 2000 }));
  assert.equal(finish1.status, "finished");
  assert.equal(finish1.activeMs, 6000);
  assert.equal(JSON.parse(await readFile(reviewFile(ctx), "utf8")).metrics.activeMs, 6000);
  const finish2 = await json(`${ctx.base}/api/session/finish`, post({ path: ctx.docPath, activeMsDelta: 2000 }));
  assert.equal(finish2.activeMs, finish1.activeMs);
  assert.equal(JSON.parse(await readFile(reviewFile(ctx), "utf8")).metrics.activeMs, 6000);
});

test("cancel persists the active-time delta (T6)", async (t) => {
  const ctx = await setup(true);
  t.after(() => ctx.server.close());
  await json(`${ctx.base}/api/review`, post({ path: ctx.docPath, activeMsDelta: 3000, annotations: [{ lineStart: 1, lineEnd: 1, kind: "note", severity: "note", note: "x" }] }));
  await json(`${ctx.base}/api/session/cancel`, post({ path: ctx.docPath, activeMsDelta: 1500 }));
  assert.equal(JSON.parse(await readFile(reviewFile(ctx), "utf8")).metrics.activeMs, 4500);
});

test("the passive flush endpoint accumulates a delta without wiping annotations", async (t) => {
  const ctx = await setup(false);
  t.after(() => ctx.server.close());
  await json(`${ctx.base}/api/review`, post({ path: ctx.docPath, activeMsDelta: 3000, annotations: [{ lineStart: 1, lineEnd: 1, kind: "note", severity: "note", note: "keep" }] }));
  await json(`${ctx.base}/api/active-time`, post({ path: ctx.docPath, activeMsDelta: 2500 }));
  const doc = await json(`${ctx.base}/api/document?path=${encodeURIComponent(ctx.docPath)}`);
  assert.equal(doc.review.metrics.activeMs, 5500);
  assert.equal(doc.review.annotations[0].note, "keep");
});

test("an old store file without metrics loads as zero and upgrades on save (T7)", async (t) => {
  const ctx = await setup(false);
  t.after(() => ctx.server.close());
  const opened = await json(`${ctx.base}/api/document?path=${encodeURIComponent(ctx.docPath)}`);
  await mkdir(join(ctx.config.storageDir, "reviews"), { recursive: true });
  await writeFile(reviewFile(ctx), JSON.stringify({ documentPath: ctx.docPath, documentDigest: opened.document.digest, summary: "", annotations: [], createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z" }));
  const doc = await json(`${ctx.base}/api/document?path=${encodeURIComponent(ctx.docPath)}`);
  assert.equal(doc.review.metrics.activeMs, 0);
  await json(`${ctx.base}/api/review`, post({ path: ctx.docPath, activeMsDelta: 3000, annotations: [] }));
  assert.equal(JSON.parse(await readFile(reviewFile(ctx), "utf8")).metrics.activeMs, 3000);
});
