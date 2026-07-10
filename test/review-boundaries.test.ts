import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ReviewerService } from "../src/application/reviewer-service.ts";
import { ReviewSessionWaiter } from "../src/application/review-session.ts";
import type { AppConfig } from "../src/config.ts";
import { FileDocumentReader } from "../src/infrastructure/file-document-reader.ts";
import { JsonReviewStore } from "../src/infrastructure/json-review-store.ts";
import { createHttpServer } from "../src/interfaces/http/http-server.ts";

test("HTTP API rejects finishing a wait session with a different document", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-"));
  const waitedPath = join(dir, "WAITED.md");
  const otherPath = join(dir, "OTHER.md");
  await writeFile(waitedPath, "# Waited\n", "utf8");
  await writeFile(otherPath, "# Other\n", "utf8");
  const config = testConfig(dir, waitedPath, true);
  const service = new ReviewerService(new FileDocumentReader(), new JsonReviewStore(config.storageDir));
  const waiter = new ReviewSessionWaiter(waitedPath);
  const { server, base } = await startServer(config, service, waiter);
  t.after(() => server.close());

  const response = await fetch(`${base}/api/session/finish`, {
    method: "POST",
    body: JSON.stringify({ path: otherPath }),
    headers: { "content-type": "application/json" },
  });
  assert.equal(response.status, 400);
  assert.equal(waiter.status, "waiting");
});

test("HTTP API rejects annotation ranges outside the document", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-"));
  const docPath = join(dir, "README.md");
  await writeFile(docPath, "# Demo\n", "utf8");
  const config = testConfig(dir, docPath);
  const service = new ReviewerService(new FileDocumentReader(), new JsonReviewStore(config.storageDir));
  const { server, base } = await startServer(config, service);
  t.after(() => server.close());

  const response = await fetch(`${base}/api/review`, {
    method: "POST",
    body: JSON.stringify({
      path: docPath,
      annotations: [{ lineStart: 3, lineEnd: 3, kind: "issue", severity: "major", note: "Impossible line" }],
    }),
    headers: { "content-type": "application/json" },
  });
  assert.equal(response.status, 400);
  assert.match(JSON.stringify(await response.json()), /exceeds document line count/);
});

test("HTTP API rejects partial review payloads without erasing saved feedback", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-"));
  const docPath = join(dir, "README.md");
  await writeFile(docPath, "# Demo\n", "utf8");
  const config = testConfig(dir, docPath);
  const service = new ReviewerService(new FileDocumentReader(), new JsonReviewStore(config.storageDir));
  const { server, base } = await startServer(config, service);
  t.after(() => server.close());
  await post(base, { path: docPath, summary: "Keep", annotations: [
    { lineStart: 1, lineEnd: 1, kind: "issue", severity: "major", note: "Do not lose" },
  ] });

  const malformed = await fetch(`${base}/api/review`, {
    method: "POST",
    body: JSON.stringify({ path: docPath, summary: 42, annotations: "wrong" }),
    headers: { "content-type": "application/json" },
  });
  assert.equal(malformed.status, 400);
  const nullSummary = await fetch(`${base}/api/review`, {
    method: "POST",
    body: JSON.stringify({ path: docPath, summary: null, annotations: [] }),
    headers: { "content-type": "application/json" },
  });
  assert.equal(nullSummary.status, 400);
  let opened = await (await fetch(`${base}/api/document?path=${encodeURIComponent(docPath)}`)).json();
  assert.equal(opened.review.summary, "Keep");
  assert.equal(opened.review.annotations.length, 1);

  await post(base, { path: docPath, annotations: opened.review.annotations });
  opened = await (await fetch(`${base}/api/document?path=${encodeURIComponent(docPath)}`)).json();
  assert.equal(opened.review.summary, "Keep");
  assert.equal(opened.review.annotations.length, 1);
});

test("HTTP API rejects open notes anchored only to blank source lines", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-"));
  const docPath = join(dir, "README.md");
  await writeFile(docPath, "# Demo\n\nBody\n", "utf8");
  const config = testConfig(dir, docPath);
  const service = new ReviewerService(new FileDocumentReader(), new JsonReviewStore(config.storageDir));
  const { server, base } = await startServer(config, service);
  t.after(() => server.close());

  const response = await fetch(`${base}/api/review`, {
    method: "POST",
    body: JSON.stringify({
      path: docPath,
      annotations: [{
        lineStart: 2,
        lineEnd: 2,
        kind: "note",
        severity: "note",
        note: "Blank anchor",
        anchorText: "client-forged",
        anchor: { sourceText: "also-forged" },
      }],
    }),
    headers: { "content-type": "application/json" },
  });
  assert.equal(response.status, 400);
  assert.match(JSON.stringify(await response.json()), /non-blank source text/);
});

async function startServer(
  config: AppConfig,
  service: ReviewerService,
  waiter: ReviewSessionWaiter | null = null,
) {
  const server = createHttpServer(config, service, join(process.cwd(), "public"), waiter);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.notEqual(address, null);
  assert.notEqual(typeof address, "string");
  return { server, base: `http://127.0.0.1:${address.port}` };
}

function testConfig(dir: string, path: string, waitForReview = false): AppConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    storageDir: join(dir, "store"),
    defaultDocumentPath: path,
    sessionId: null,
    command: "review",
    waitForReview,
    jsonOutput: false,
    openBrowser: false,
    source: { maxFileLines: 250 },
  };
}

async function post(base: string, body: unknown): Promise<Response> {
  const response = await fetch(`${base}/api/review`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  assert.equal(response.status, 200);
  return response;
}
