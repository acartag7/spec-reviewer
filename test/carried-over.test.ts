import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ReviewerService } from "../src/application/reviewer-service.ts";
import { ReviewSessionWaiter } from "../src/application/review-session.ts";
import { FileDocumentReader } from "../src/infrastructure/file-document-reader.ts";
import { JsonReviewStore } from "../src/infrastructure/json-review-store.ts";
import { createHttpServer } from "../src/interfaces/http/http-server.ts";
import type { AppConfig } from "../src/config.ts";

// Regression: file edits must never hide unresolved reviewer feedback. A missing
// anchor changes the warning attached to an item, not whether that item is live.
test("stale unresolved annotations stay visible and actionable", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-"));
  const docPath = join(dir, "README.md");
  await writeFile(docPath, "# Demo\n\nKeep this line\nTarget line one\nTarget line two\n", "utf8");
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
  const service = new ReviewerService(new FileDocumentReader(), new JsonReviewStore(config.storageDir));
  const waiter = new ReviewSessionWaiter(docPath);
  const server = createHttpServer(config, service, join(process.cwd(), "public"), waiter);
  t.after(() => server.close());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("HTTP server has no TCP port");
  const base = `http://127.0.0.1:${address.port}`;

  await json(`${base}/api/review`, {
    method: "POST",
    body: JSON.stringify({
      path: docPath,
      baseRevision: 0,
      annotations: [
        { lineStart: 3, lineEnd: 3, kind: "issue", severity: "major", note: "Live note" },
        { lineStart: 4, lineEnd: 4, kind: "issue", severity: "major", note: "Gone note one" },
        { lineStart: 5, lineEnd: 5, kind: "issue", severity: "minor", note: "Gone note two" },
      ],
    }),
    headers: { "content-type": "application/json" },
  });

  const before = await json(`${base}/api/export?path=${encodeURIComponent(docPath)}`);
  assert.equal(before.openAnnotations, 3);
  assert.equal(before.carriedOver, 0);

  await writeFile(docPath, "# Demo\n\nKeep this line\nRewritten section\n", "utf8");

  const after = await json(`${base}/api/export?path=${encodeURIComponent(docPath)}`);
  assert.equal(after.openAnnotations, 3);
  assert.equal(after.carriedOver, 0);
  assert.match(after.markdown, /## Required Changes/);
  assert.match(after.markdown, /Live note/);
  assert.match(after.markdown, /Gone note one/);
  assert.match(after.markdown, /Gone note two/);
  assert.doesNotMatch(after.markdown, /## Carried Over/);
  assert.match(after.markdown, /\(anchor not found\)/);

  await json(`${base}/api/session/finish`, {
    method: "POST",
    body: JSON.stringify({ path: docPath }),
    headers: { "content-type": "application/json" },
  });
  const completion = await waiter.wait();
  assert.equal(completion.status, "finished");
  if (completion.status === "finished") {
    assert.equal(completion.openAnnotations, 3);
    assert.equal(completion.carriedOver, 0);
  }
});

async function json(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data;
}
