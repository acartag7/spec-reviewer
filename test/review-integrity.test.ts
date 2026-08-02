import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ReviewerService } from "../src/application/reviewer-service.ts";
import type { ReviewStore } from "../src/application/ports.ts";
import { parseMarkdownDocument } from "../src/domain/document.ts";
import { AppError } from "../src/domain/errors.ts";
import { createEmptyReview, withResolvedAnchors } from "../src/domain/review.ts";
import { FileDocumentReader } from "../src/infrastructure/file-document-reader.ts";
import { JsonReviewStore } from "../src/infrastructure/json-review-store.ts";

async function fresh(content = "# Spec\n\nSource line\n") {
  const dir = await mkdtemp(join(tmpdir(), "spec-reviewer-integrity-"));
  const path = join(dir, "spec.md");
  await writeFile(path, content, "utf8");
  const store = new JsonReviewStore(join(dir, "store"));
  return { dir, path, store, service: new ReviewerService(new FileDocumentReader(), store) };
}

function annotation(overrides: Record<string, unknown> = {}) {
  return {
    lineStart: 3,
    lineEnd: 3,
    kind: "issue",
    severity: "major",
    note: "Fix this",
    ...overrides,
  };
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error) => error instanceof AppError && error.code === code);
}

test("stale content writes fail without replacing the newer review", async () => {
  const { path, store, service } = await fresh();
  const first = await service.saveReview({
    path,
    baseRevision: 0,
    summary: "newer",
    annotations: [annotation()],
  });
  assert.equal(first.revision, 1);

  await expectCode(service.saveReview({ path, baseRevision: 0, summary: "stale", activeMsDelta: 750 }), "review_conflict");
  const stored = await store.load(path);
  assert.equal(stored?.summary, "newer");
  assert.equal(stored?.annotations.length, 1);
  assert.equal(stored?.revision, 1);
  assert.equal(stored?.metrics.activeMs, 750);
});

test("partial and active-only saves preserve omitted content and revision", async () => {
  const { path, service } = await fresh();
  const first = await service.saveReview({ path, baseRevision: 0, summary: "keep", annotations: [annotation()] });
  const summaryOnly = await service.saveReview({ path, baseRevision: first.revision, summary: "changed" });
  assert.equal(summaryOnly.annotations.length, 1);
  assert.equal(summaryOnly.revision, 2);
  const activeOnly = await service.saveReview({ path, activeMsDelta: 2000 });
  assert.equal(activeOnly.summary, "changed");
  assert.equal(activeOnly.annotations.length, 1);
  assert.equal(activeOnly.revision, 2);
  assert.equal(activeOnly.metrics.activeMs, 2000);
});

test("the server derives annotation evidence and ignores forged response fields", async () => {
  const { path, service } = await fresh("# Trusted section\n\nTrusted source\n");
  const saved = await service.saveReview({
    path,
    baseRevision: 0,
    annotations: [annotation({
      id: "stable-id",
      selectedText: "client quote",
      section: "client section",
      anchorText: "client anchor",
      createdAt: "2000-01-01T00:00:00.000Z",
      updatedAt: "2000-01-01T00:00:00.000Z",
      anchorState: "not-found",
      anchor: { state: "not-found" },
    })],
  });
  const item = saved.annotations[0];
  assert.ok(item);
  assert.equal(item.selectedText, "Trusted source");
  assert.equal(item.anchorText, "Trusted source");
  assert.equal(item.section, "Trusted section");
  assert.notEqual(item.createdAt, "2000-01-01T00:00:00.000Z");
  assert.equal(item.anchorState, "ok");
});

test("annotation validation rejects the bounded edge classes without writing", async () => {
  const content = ["# Spec", ...Array.from({ length: 600 }, (_, index) => index === 1 ? "" : `line ${index}`)].join("\n");
  const { path, store, service } = await fresh(content);
  const invalid = [
    annotation({ lineStart: 0 }),
    annotation({ lineStart: 4, lineEnd: 3 }),
    annotation({ lineStart: 700, lineEnd: 700 }),
    annotation({ lineStart: 3, lineEnd: 3 }),
    annotation({ lineStart: 2, lineEnd: 502 }),
    annotation({ note: " " }),
    annotation({ kind: "unknown" }),
  ];
  for (const item of invalid) {
    await expectCode(service.saveReview({ path, baseRevision: 0, annotations: [item] }), "invalid_review");
  }
  await expectCode(service.saveReview({
    path,
    baseRevision: 0,
    annotations: [annotation({ id: "same" }), annotation({ id: "same" })],
  }), "invalid_review");
  const tooMany = Array.from({ length: 201 }, (_, index) => annotation({ id: `a-${index}` }));
  await expectCode(service.saveReview({ path, baseRevision: 0, annotations: tooMany }), "invalid_review");
  const totalTooLarge = Array.from({ length: 41 }, (_, index) => annotation({
    id: `wide-${index}`,
    lineStart: 3,
    lineEnd: 502,
  }));
  await expectCode(service.saveReview({ path, baseRevision: 0, annotations: totalTooLarge }), "invalid_review");
  await expectCode(service.saveReview({ path, baseRevision: 0, summary: "x".repeat(65_537) }), "invalid_review");
  await expectCode(service.saveReview({ path, baseRevision: 0, annotations: [annotation({ note: "x".repeat(65_537) })] }), "invalid_review");
  await expectCode(service.saveReview({ path, baseRevision: 0, annotations: [annotation({ id: "é".repeat(65) })] }), "invalid_review");
  await writeFile(path, `# Spec\n${"x".repeat(65_537)}\n`, "utf8");
  await expectCode(service.saveReview({ path, baseRevision: 0, annotations: [annotation({ lineStart: 2, lineEnd: 2 })] }), "invalid_review");
  assert.equal(await store.load(path), null);
});

test("an unchanged stored range remains editable after the source shrinks", async () => {
  const { path, service } = await fresh("# Spec\n\none\ntwo\nthree\n");
  const first = await service.saveReview({ path, baseRevision: 0, annotations: [annotation({ lineStart: 5, lineEnd: 5 })] });
  const prior = first.annotations[0];
  assert.ok(prior);
  await writeFile(path, "# Spec\n", "utf8");
  const edited = await service.saveReview({
    path,
    baseRevision: first.revision,
    annotations: [{ ...prior, note: "Still needs a manual check" }],
  });
  const editedItem = edited.annotations[0];
  assert.ok(editedItem);
  assert.equal(editedItem.note, "Still needs a manual check");
  assert.equal(editedItem.anchorText, "three");
  assert.equal(editedItem.anchorState, "not-found");
  assert.equal(edited.revision, 2);
});

test("not-found anchor resolution stays bounded on large edited documents", () => {
  const content = Array.from({ length: 40_000 }, (_, index) => `line ${index}`).join("\n");
  const document = parseMarkdownDocument("/tmp/large.md", content);
  const base = createEmptyReview(document.path, "0".repeat(64));
  base.annotations = Array.from({ length: 10 }, (_, index) => ({
    id: `missing-${index}`,
    lineStart: 1,
    lineEnd: 500,
    section: null,
    selectedText: null,
    kind: "issue",
    severity: "major",
    status: "open",
    note: "Find this",
    agentAction: "",
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    anchorText: [`missing anchor ${index}`, ...Array(499).fill("missing")].join("\n"),
  }));
  const started = performance.now();
  const resolved = withResolvedAnchors(document, base);
  const elapsed = performance.now() - started;
  assert.equal(resolved.annotations.every((item) => item.anchorState === "not-found"), true);
  assert.ok(elapsed < 1500, `anchor resolution took ${Math.round(elapsed)} ms`);
});

test("legacy reviews can be progressively repaired through normal content saves", async () => {
  const { path, store, service } = await fresh();
  const legacy = createEmptyReview(path, "0".repeat(64));
  legacy.summary = "s".repeat(65_537);
  legacy.annotations = Array.from({ length: 202 }, (_, index) => ({
    id: `legacy-${index}`,
    lineStart: 3,
    lineEnd: index < 41 ? 502 : 3,
    section: "Spec",
    selectedText: "Source line",
    kind: "issue",
    severity: "major",
    status: "open",
    note: index === 2 ? "n".repeat(65_537) : `note ${index}`,
    agentAction: "",
    createdAt: "legacy-date",
    updatedAt: "legacy-date",
    anchorText: "Source line",
  }));
  await store.save(legacy);
  const changedRange = legacy.annotations.slice(1);
  const firstChanged = changedRange[0];
  assert.ok(firstChanged);
  changedRange[0] = { ...firstChanged, lineEnd: 3 };
  await expectCode(service.saveReview({ path, baseRevision: 0, annotations: changedRange }), "invalid_review");
  const reduced = await service.saveReview({
    path,
    baseRevision: 0,
    summary: legacy.summary,
    annotations: legacy.annotations.slice(2),
  });
  assert.equal(reduced.annotations.length, 200);
  assert.equal(reduced.annotations.at(0)?.note.length, 65_537);
  const repaired = await service.saveReview({
    path,
    baseRevision: reduced.revision,
    summary: "repaired",
    annotations: reduced.annotations,
  });
  assert.equal(repaired.summary, "repaired");
  assert.equal(repaired.revision, 2);
});

test("legacy span errors explain that deletion or range reduction is required", async () => {
  const { path, store, service } = await fresh();
  const legacy = createEmptyReview(path, "0".repeat(64));
  legacy.annotations = Array.from({ length: 41 }, (_, index) => ({
    ...annotation({ id: `wide-${index}`, lineEnd: 502 }),
    id: `wide-${index}`,
    kind: "issue" as const,
    severity: "major" as const,
    section: "Spec", selectedText: "Source line", status: "open" as const,
    agentAction: "", createdAt: "legacy", updatedAt: "legacy", anchorText: "Source line",
  }));
  await store.save(legacy);
  await assert.rejects(
    service.saveReview({ path, baseRevision: 0, annotations: legacy.annotations }),
    (error) => error instanceof AppError && /delete annotations or reduce their ranges/.test(error.message),
  );
});

test("a metric storage failure reports both the content rejection and persistence failure", async () => {
  const { path, store } = await fresh();
  const failingStore: ReviewStore = {
    load: (value) => store.load(value),
    loadById: (value) => store.loadById(value),
    listRecent: (value) => store.listRecent(value),
    save: async () => { throw new AppError("storage_write_failed", 500, "Review storage write failed"); },
  };
  const service = new ReviewerService(new FileDocumentReader(), failingStore);
  await assert.rejects(
    service.saveReview({ path, baseRevision: 0, annotations: [annotation({ note: " " })], activeMsDelta: 1 }),
    (error) => error instanceof AppError
      && error.code === "review_rejected_metrics_persist_failed"
      && /note is required; active time storage could not be confirmed/.test(error.message),
  );
});
