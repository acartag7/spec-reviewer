import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ReviewerService } from "../src/application/reviewer-service.ts";
import { ReviewSessionWaiter } from "../src/application/review-session.ts";
import type { AppConfig } from "../src/config.ts";
import { FileDocumentReader } from "../src/infrastructure/file-document-reader.ts";
import { JsonReviewRoundStore } from "../src/infrastructure/json-review-round-store.ts";
import { JsonReviewStore } from "../src/infrastructure/json-review-store.ts";
import { createHttpServer } from "../src/interfaces/http/http-server.ts";
import { json, serverPort } from "./http-test-utils.ts";

const yamlBody = ["# service config", "name: demo", "port: 8080", ""].join("\n");

test("HTTP API opens YAML as source and round-trips a line note", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-yaml-"));
  const docPath = join(dir, "plan.yaml");
  await writeFile(docPath, yamlBody, "utf8");
  const { base, server } = await startReview(dir, docPath, false);
  t.after(() => server.close());

  const opened = await json(`${base}/api/document?path=${encodeURIComponent(docPath)}`);
  assert.equal(opened.document.format, "source");
  assert.equal(opened.document.title, "plan.yaml");
  assert.deepEqual(opened.document.sections, []);
  assert.equal(opened.document.lines[0]?.kind, "normal");
  assert.equal(opened.document.lines[0]?.text, "# service config");

  const saved = await json(`${base}/api/review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      path: docPath,
      baseRevision: 0,
      summary: "Tighten the service name",
      annotations: [{ lineStart: 2, lineEnd: 2, kind: "issue", severity: "major", note: "Rename demo" }],
    }),
  });
  assert.equal(saved.annotations[0].lineStart, 2);
  assert.equal(saved.annotations[0].anchorState, "ok");

  const reopened = await json(`${base}/api/document?path=${encodeURIComponent(docPath)}`);
  assert.equal(reopened.document.format, "source");
  assert.equal(reopened.review.annotations[0].note, "Rename demo");
  assert.equal(reopened.review.annotations[0].lineStart, 2);
  assert.equal(reopened.sourceState, "current");

  const exported = await json(`${base}/api/export?path=${encodeURIComponent(docPath)}`);
  assert.match(exported.markdown, /# Agent Review Feedback/);
  assert.match(exported.markdown, /Rename demo/);
  assert.match(exported.markdown, /name: demo/);
});

test("Finish still returns agent Markdown for a YAML review", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-yaml-wait-"));
  const docPath = join(dir, "plan.yaml");
  await writeFile(docPath, yamlBody, "utf8");
  const { base, server, waiter } = await startReview(dir, docPath, true);
  t.after(() => server.close());
  assert.ok(waiter);

  await json(`${base}/api/review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      path: docPath,
      baseRevision: 0,
      annotations: [{ lineStart: 3, lineEnd: 3, kind: "issue", severity: "major", note: "Use 8443" }],
    }),
  });
  const response = await json(`${base}/api/session/finish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: docPath }),
  });
  const completion = await waiter.wait();
  assert.equal(response.status, "finished");
  assert.equal(completion.status, "finished");
  assert.match(completion.status === "finished" ? completion.markdown : "", /Use 8443/);
  assert.match(completion.status === "finished" ? completion.markdown : "", /port: 8080/);
});

test("HTTP upload fatal-decodes original YAML bytes", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-yaml-upload-"));
  const docPath = join(dir, "plan.yaml");
  await writeFile(docPath, yamlBody, "utf8");
  const { base, server } = await startReview(dir, docPath, false);
  t.after(() => server.close());

  const opened = await json(`${base}/api/document-upload`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "dropped.yaml",
      bytes: Buffer.from("# comment\nname: demo\n").toString("base64"),
    }),
  });
  assert.equal(opened.document.format, "source");
  assert.equal(opened.document.lines[0]?.kind, "normal");
  assert.equal(opened.document.lines[0]?.text, "# comment");

  const rejected = await fetch(`${base}/api/document-upload`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "dropped.yaml",
      bytes: Buffer.from([0x80, 0x81, 0x82]).toString("base64"),
    }),
  });
  assert.equal(rejected.status, 400);
  const body = await rejected.json() as { error: { message: string } };
  assert.equal(body.error.message, "Binary files cannot be reviewed");
});

async function startReview(dir: string, docPath: string, wait: boolean) {
  const config: AppConfig = {
    host: "127.0.0.1",
    port: 0,
    storageDir: join(dir, "store"),
    defaultDocumentPath: docPath,
    sessionId: null,
    skillArgs: [],
    command: "review",
    waitForReview: wait,
    jsonOutput: false,
    openBrowser: false,
    source: { maxFileLines: 250 },
  };
  const service = new ReviewerService(
    new FileDocumentReader(),
    new JsonReviewStore(config.storageDir),
    new JsonReviewRoundStore(config.storageDir),
  );
  const waiter = wait ? new ReviewSessionWaiter(docPath) : null;
  const server = createHttpServer(config, service, join(process.cwd(), "public"), waiter);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, waiter, base: `http://127.0.0.1:${serverPort(server)}` };
}
