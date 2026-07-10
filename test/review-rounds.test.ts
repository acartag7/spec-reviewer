import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ReviewerService } from "../src/application/reviewer-service.ts";
import { FileDocumentReader } from "../src/infrastructure/file-document-reader.ts";
import { JsonReviewStore } from "../src/infrastructure/json-review-store.ts";

test("a changed review becomes current only after drift is handled explicitly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-"));
  const docPath = join(dir, "README.md");
  const service = new ReviewerService(new FileDocumentReader(), new JsonReviewStore(join(dir, "store")));
  await writeFile(docPath, "# Demo\n\nTarget\n", "utf8");
  const saved = await service.saveReview({
    path: docPath,
    annotations: [{ lineStart: 3, lineEnd: 3, kind: "issue", severity: "major", note: "Fix target" }],
  });
  await writeFile(docPath, "# Demo\n\nReplacement\n", "utf8");
  await assert.rejects(
    service.confirmCurrentVersion(docPath),
    /resolve or re-anchor every drifting open note/,
  );

  await service.saveReview({
    path: docPath,
    annotations: [{ ...saved.annotations[0], status: "resolved" }],
  });
  const confirmed = await service.confirmCurrentVersion(docPath);
  const opened = await service.openDocument(docPath);
  assert.equal(confirmed.documentDigest, opened.document.digest);
  assert.equal(opened.sourceState, "current");
});
