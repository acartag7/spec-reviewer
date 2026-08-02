import assert from "node:assert/strict";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathKey } from "../src/domain/ids.ts";
import { ReviewerService } from "../src/application/reviewer-service.ts";
import { ReviewSessionWaiter } from "../src/application/review-session.ts";
import { FileDocumentReader } from "../src/infrastructure/file-document-reader.ts";
import { JsonReviewStore } from "../src/infrastructure/json-review-store.ts";
import { JsonReviewRoundStore } from "../src/infrastructure/json-review-round-store.ts";
import { createHttpServer } from "../src/interfaces/http/http-server.ts";
import type { AppConfig } from "../src/config.ts";
import { json, rawStatus, serverPort } from "./http-test-utils.ts";

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
    skillArgs: [],
    command: "review",
    waitForReview: false,
    jsonOutput: false,
    openBrowser: false,
    source: { maxFileLines: 250 },
  };
  const service = new ReviewerService(new FileDocumentReader(), new JsonReviewStore(config.storageDir), new JsonReviewRoundStore(config.storageDir));
  const server = createHttpServer(config, service, join(process.cwd(), "public"));
  t.after(() => server.close());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${serverPort(server)}`;

  const opened = await json(`${base}/api/document?path=${encodeURIComponent(docPath)}`);
  assert.equal(opened.document.title, "Demo");

  const saved = await json(`${base}/api/review`, {
    method: "POST",
    body: JSON.stringify({
      path: docPath,
      baseRevision: 0,
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
      baseRevision: saved.revision,
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
    skillArgs: [],
    command: "review",
    waitForReview: false,
    jsonOutput: false,
    openBrowser: false,
    source: { maxFileLines: 250 },
  };
  const service = new ReviewerService(new FileDocumentReader(), new JsonReviewStore(config.storageDir), new JsonReviewRoundStore(config.storageDir));
  const server = createHttpServer(config, service, join(process.cwd(), "public"));
  t.after(() => server.close());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${serverPort(server)}`;

  const saved = await json(`${base}/api/review`, {
    method: "POST",
    body: JSON.stringify({
      path: docPath,
      baseRevision: 0,
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
      baseRevision: saved.revision,
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
    skillArgs: [],
    command: "review",
    waitForReview: false,
    jsonOutput: false,
    openBrowser: false,
    source: { maxFileLines: 250 },
  };
  const service = new ReviewerService(new FileDocumentReader(), new JsonReviewStore(config.storageDir), new JsonReviewRoundStore(config.storageDir));
  const server = createHttpServer(config, service, join(process.cwd(), "public"));
  t.after(() => server.close());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = serverPort(server);

  const rejectedHost = await rawStatus(port, "/api/health", { Host: "evil.com" });
  assert.equal(rejectedHost.status, 403);

  const rejectedOrigin = await rawStatus(port, "/api/health", {
    Origin: "http://evil.com",
    Host: `127.0.0.1:${port}`,
  });
  assert.equal(rejectedOrigin.status, 403);

  const accepted = await rawStatus(port, "/api/health", { Host: `127.0.0.1:${port}` });
  assert.equal(accepted.status, 200);
  assert.match(String(accepted.headers["content-security-policy"] ?? ""), /default-src 'self'/);
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
    skillArgs: [],
    command: "review",
    waitForReview: true,
    jsonOutput: false,
    openBrowser: false,
    source: { maxFileLines: 250 },
  };
  const service = new ReviewerService(new FileDocumentReader(), new JsonReviewStore(config.storageDir), new JsonReviewRoundStore(config.storageDir));
  const waiter = new ReviewSessionWaiter(docPath);
  const server = createHttpServer(config, service, join(process.cwd(), "public"), waiter);
  t.after(() => server.close());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${serverPort(server)}`;

  await json(`${base}/api/review`, {
    method: "POST",
    body: JSON.stringify({
      path: docPath,
      baseRevision: 0,
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
  const rounds = await readdir(join(config.storageDir, "rounds", pathKey(docPath)));
  assert.equal(rounds.filter((name) => name.endsWith(".json")).length, 1);
});
