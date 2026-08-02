import { fireEvent, render, screen } from "@testing-library/react"
import { expect, test, vi } from "vitest"
import type { Review, ReviewComparison, ReviewDocument } from "@/api/types"
import { Workspace } from "@/components/Workspace"
import { emptyForm } from "@/lib/review-utils"

test("terminal completion blocks draft selection from every reader view", () => {
  const selection = { lineStart: 1, lineEnd: 1, selectedText: "# Title" }
  const onSelection = vi.fn()
  render(
    <Workspace
      document={documentFixture}
      review={reviewFixture}
      selection={selection}
      sourceState="changed"
      comparison={changedComparison}
      form={emptyForm(selection)}
      summary=""
      exportMarkdown=""
      exportLoading={false}
      saving={false}
      terminalPending
      onSelection={onSelection}
      onFormChange={vi.fn()}
      onFormSubmit={vi.fn()}
      onFormReset={vi.fn()}
      onSummaryChange={vi.fn()}
      onSummarySave={vi.fn()}
      onEditAnnotation={vi.fn()}
      onStatusAnnotation={vi.fn()}
      onDeleteAnnotation={vi.fn()}
      onCopyExport={vi.fn()}
    />,
  )

  fireEvent.click(screen.getByRole("row", { name: /Added, plus marker, new line 3/ }))
  fireEvent.click(screen.getByRole("tab", { name: "Source" }))
  fireEvent.click(screen.getByRole("button", { name: "Add note at line 3" }))
  fireEvent.click(screen.getByRole("tab", { name: "Rendered" }))
  fireEvent.click(screen.getByText("Open local file."))

  expect(onSelection).not.toHaveBeenCalled()
})

const documentFixture: ReviewDocument = {
  path: "/tmp/spec.md",
  title: "Title",
  digest: "digest",
  sections: [{ line: 1, level: 1, title: "Title" }],
  lines: [
    { number: 1, text: "# Title", kind: "heading", sectionTitle: "Title" },
    { number: 2, text: "", kind: "blank", sectionTitle: "Title" },
    { number: 3, text: "- Open local file.", kind: "list", sectionTitle: "Title" },
  ],
}

const reviewFixture: Review = {
  documentPath: documentFixture.path,
  documentDigest: documentFixture.digest,
  revision: 0,
  summary: "",
  annotations: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  metrics: { activeMs: 0 },
}

const changedComparison: ReviewComparison = {
  state: "diff",
  roundId: "1750000000000-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  completedAt: "2025-06-15T15:06:40.000Z",
  beforeDigest: "a".repeat(64),
  afterDigest: "b".repeat(64),
  added: 1,
  removed: 1,
  rows: [
    { kind: "remove", oldLine: 3, newLine: null, text: "Old line" },
    { kind: "add", oldLine: null, newLine: 3, text: "- Open local file." },
  ],
}
