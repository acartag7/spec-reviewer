import { useState } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { expect, test, vi } from "vitest"
import type { Annotation, Review, ReviewDocument, SelectionRange } from "@/api/types"
import { ReviewSidebar } from "@/components/ReviewSidebar"
import { emptyForm, formFromAnnotation, type AnnotationFormValue } from "@/lib/review-utils"

test("preserves a saved range beyond a shortened document but blocks reanchoring it", () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole("tab", { name: /Notes/ }))
  fireEvent.click(screen.getByRole("button", { name: "Edit" }))
  expect(screen.getByRole("button", { name: "Update note" })).toBeEnabled()

  fireEvent.click(screen.getByText("Adjust source range"))
  fireEvent.change(screen.getByRole("spinbutton", { name: "From line" }), { target: { value: "7" } })
  expect(screen.getByRole("button", { name: "Update note" })).toBeDisabled()
})

function Harness() {
  const selection: SelectionRange = { lineStart: 1, lineEnd: 1, selectedText: "# Short" }
  const [form, setForm] = useState<AnnotationFormValue>(() => emptyForm(selection))
  return (
    <ReviewSidebar
      document={documentFixture}
      review={reviewFixture}
      selection={selection}
      form={form}
      summary=""
      exportMarkdown=""
      exportLoading={false}
      saving={false}
      selectionRequest={0}
      onFormChange={setForm}
      onFormSubmit={vi.fn()}
      onFormReset={vi.fn()}
      onSummaryChange={vi.fn()}
      onSummarySave={vi.fn()}
      onOpenAnnotation={vi.fn()}
      onEditAnnotation={(annotation) => setForm(formFromAnnotation(annotation))}
      onStatusAnnotation={vi.fn()}
      onDeleteAnnotation={vi.fn()}
      onCopyExport={vi.fn()}
    />
  )
}

const annotation: Annotation = {
  id: "old-range",
  lineStart: 8,
  lineEnd: 9,
  section: "Old",
  selectedText: "old text",
  kind: "issue",
  severity: "major",
  status: "open",
  note: "Keep this note",
  agentAction: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  anchorState: "not-found",
  anchor: { state: "not-found" },
}

const documentFixture: ReviewDocument = {
  path: "/tmp/short.md",
  title: "Short",
  digest: "digest",
  lines: [
    { number: 1, text: "# Short", kind: "heading", sectionTitle: "Short" },
    { number: 2, text: "", kind: "blank", sectionTitle: "Short" },
    { number: 3, text: "End", kind: "normal", sectionTitle: "Short" },
  ],
  sections: [{ line: 1, level: 1, title: "Short" }],
}

const reviewFixture: Review = {
  documentPath: documentFixture.path,
  documentDigest: documentFixture.digest,
  revision: 2,
  summary: "",
  annotations: [annotation],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  metrics: { activeMs: 0 },
}
