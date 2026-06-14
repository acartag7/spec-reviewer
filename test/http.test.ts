import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ReviewerService } from "../src/application/reviewer-service.ts";
import { ReviewSessionWaiter } from "../src/application/review-session.ts";
import { FileDocumentReader } from "../src/infrastructure/file-document-reader.ts";
import { JsonReviewStore } from "../src/infrastructure/json-review-store.ts";
import { createHttpServer } from "../src/interfaces/http/http-server.ts";
import type { AppConfig } from "../src/config.ts";

test("HTTP API opens, saves, and exports a review", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-"));
  const docPath = join(dir, "README.md");
  await writeFile(docPath, "# Demo\n\nNeeds review\n", "utf8");

  const config: AppConfig = {
    host: "127.0.0.1",
    port: 0,
    storageDir: join(dir, "store"),
    defaultDocumentPath: docPath,
    sessionId: null,
    command: "review",
    waitForReview: false,
    jsonOutput: false,
    openBrowser: false,
    source: { maxFileLines: 250 },
  };
  const service = new ReviewerService(new FileDocumentReader(), new JsonReviewStore(config.storageDir));
  const server = createHttpServer(config, service, join(process.cwd(), "public"));
  t.after(() => server.close());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.notEqual(address, null);
  assert.notEqual(typeof address, "string");
  const base = `http://127.0.0.1:${address.port}`;

  const opened = await json(`${base}/api/document?path=${encodeURIComponent(docPath)}`);
  assert.equal(opened.document.title, "Demo");

  const saved = await json(`${base}/api/review`, {
    method: "POST",
    body: JSON.stringify({
      path: docPath,
      summary: "Summary",
      annotations: [{ lineStart: 3, lineEnd: 3, kind: "issue", severity: "major", note: "Fix this" }],
    }),
    headers: { "content-type": "application/json" },
  });
  const exported = await json(`${base}/api/export?path=${encodeURIComponent(docPath)}`);
  assert.match(exported.markdown, /Fix this/);

  await writeFile(docPath, "# Demo\n\nChanged\n", "utf8");
  const changed = await json(`${base}/api/document?path=${encodeURIComponent(docPath)}`);
  assert.equal(changed.sourceState, "changed");
  assert.equal(changed.stale, true);
  assert.equal(changed.review.annotations[0].anchorState, "not-found");

  await json(`${base}/api/review`, {
    method: "POST",
    body: JSON.stringify({
      path: docPath,
      summary: "Summary",
      annotations: [{
        id: saved.annotations[0].id,
        lineStart: 3,
        lineEnd: 3,
        kind: "issue",
        severity: "major",
        note: "Still stale",
      }],
    }),
    headers: { "content-type": "application/json" },
  });
  const afterSave = await json(`${base}/api/document?path=${encodeURIComponent(docPath)}`);
  assert.equal(afterSave.sourceState, "changed");
  assert.equal(afterSave.review.annotations[0].anchorState, "not-found");

  const recent = await json(`${base}/api/reviews`);
  assert.equal(recent[0].sourceState, "changed");
  assert.equal(await service.documentPathForSession(recent[0].id), docPath);
});

test("HTTP API resolves moved annotation anchors without changing saved lines", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-"));
  const docPath = join(dir, "README.md");
  await writeFile(docPath, "# Demo\n\nTarget text\nOther\n", "utf8");
  const config: AppConfig = {
    host: "127.0.0.1",
    port: 0,
    storageDir: join(dir, "store"),
    defaultDocumentPath: docPath,
    sessionId: null,
    command: "review",
    waitForReview: false,
    jsonOutput: false,
    openBrowser: false,
    source: { maxFileLines: 250 },
  };
  const service = new ReviewerService(new FileDocumentReader(), new JsonReviewStore(config.storageDir));
  const server = createHttpServer(config, service, join(process.cwd(), "public"));
  t.after(() => server.close());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.notEqual(address, null);
  assert.notEqual(typeof address, "string");
  const base = `http://127.0.0.1:${address.port}`;

  const saved = await json(`${base}/api/review`, {
    method: "POST",
    body: JSON.stringify({
      path: docPath,
      annotations: [{ lineStart: 3, lineEnd: 3, kind: "issue", severity: "major", note: "Track this" }],
    }),
    headers: { "content-type": "application/json" },
  });
  assert.equal(saved.annotations[0].anchorState, "ok");

  await writeFile(docPath, "# Demo\n\nOther\nCurrent replacement\nTarget text\n", "utf8");
  const moved = await json(`${base}/api/document?path=${encodeURIComponent(docPath)}`);
  assert.equal(moved.review.annotations[0].lineStart, 3);
  assert.equal(moved.review.annotations[0].anchorState, "moved");
  assert.equal(moved.review.annotations[0].anchor.lineStart, 5);

  const driftedExport = await json(`${base}/api/export?path=${encodeURIComponent(docPath)}`);
  assert.match(driftedExport.markdown, /saved line 3 \(current line 5\)/);
  assert.match(driftedExport.markdown, /Anchor drift: saved text now appears at line 5/);

  const reanchored = await json(`${base}/api/review`, {
    method: "POST",
    body: JSON.stringify({
      path: docPath,
      annotations: [{
        id: saved.annotations[0].id,
        lineStart: 4,
        lineEnd: 4,
        kind: "issue",
        severity: "major",
        note: "Reanchor to this current line",
      }],
    }),
    headers: { "content-type": "application/json" },
  });
  assert.equal(reanchored.annotations[0].lineStart, 4);
  assert.equal(reanchored.annotations[0].anchorState, "ok");

  const refreshedExport = await json(`${base}/api/export?path=${encodeURIComponent(docPath)}`);
  assert.doesNotMatch(refreshedExport.markdown, /Anchor drift: saved text now appears at line 5/);
});

test("HTTP server rejects non-loopback Host and Origin headers", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-"));
  const config: AppConfig = {
    host: "127.0.0.1",
    port: 0,
    storageDir: join(dir, "store"),
    defaultDocumentPath: null,
    sessionId: null,
    command: "review",
    waitForReview: false,
    jsonOutput: false,
    openBrowser: false,
    source: { maxFileLines: 250 },
  };
  const service = new ReviewerService(new FileDocumentReader(), new JsonReviewStore(config.storageDir));
  const server = createHttpServer(config, service, join(process.cwd(), "public"));
  t.after(() => server.close());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.notEqual(address, null);
  assert.notEqual(typeof address, "string");

  const rejectedHost = await rawStatus(address.port, "/api/health", { Host: "evil.com" });
  assert.equal(rejectedHost.status, 403);

  const rejectedOrigin = await rawStatus(address.port, "/api/health", {
    Origin: "http://evil.com",
    Host: `127.0.0.1:${address.port}`,
  });
  assert.equal(rejectedOrigin.status, 403);

  const accepted = await rawStatus(address.port, "/api/health", { Host: `127.0.0.1:${address.port}` });
  assert.equal(accepted.status, 200);
  assert.match(accepted.headers["content-security-policy"] ?? "", /default-src 'self'/);
});

test("HTTP API finish resolves a waiting review session", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-"));
  const docPath = join(dir, "README.md");
  await writeFile(docPath, "# Demo\n\nNeeds review\n", "utf8");
  const config: AppConfig = {
    host: "127.0.0.1",
    port: 0,
    storageDir: join(dir, "store"),
    defaultDocumentPath: docPath,
    sessionId: null,
    command: "review",
    waitForReview: true,
    jsonOutput: false,
    openBrowser: false,
    source: { maxFileLines: 250 },
  };
  const service = new ReviewerService(new FileDocumentReader(), new JsonReviewStore(config.storageDir));
  const waiter = new ReviewSessionWaiter(docPath);
  const server = createHttpServer(config, service, join(process.cwd(), "public"), waiter);
  t.after(() => server.close());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.notEqual(address, null);
  assert.notEqual(typeof address, "string");
  const base = `http://127.0.0.1:${address.port}`;

  await json(`${base}/api/review`, {
    method: "POST",
    body: JSON.stringify({
      path: docPath,
      annotations: [{ lineStart: 3, lineEnd: 3, kind: "issue", severity: "major", note: "Fix this" }],
    }),
    headers: { "content-type": "application/json" },
  });
  const response = await json(`${base}/api/session/finish`, {
    method: "POST",
    body: JSON.stringify({ path: docPath }),
    headers: { "content-type": "application/json" },
  });
  const completion = await waiter.wait();
  assert.equal(response.status, "finished");
  assert.equal(completion.status, "finished");
  assert.match(completion.status === "finished" ? completion.markdown : "", /Fix this/);
});

async function json(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function rawStatus(port: number, path: string, headers: Record<string, string>) {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined> }>((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, headers }, (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers }));
    });
    req.on("error", reject);
    req.end();
  });
}
