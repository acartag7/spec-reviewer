import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { expect, test, vi } from "vitest"
import type { Review, ReviewDocument } from "@/api/types"
import { ReaderPane } from "@/components/ReaderPane"
import { Workspace } from "@/components/Workspace"
import { emptyForm } from "@/lib/review-utils"

test("renders markdown by default and keeps source-line click anchors", () => {
  const onSelect = vi.fn()
  render(
    <ReaderPane
      document={documentFixture}
      review={reviewFixture}
      selection={{ lineStart: 0, lineEnd: 0, selectedText: "" }}
      sourceState="current"
      comparison={{ state: "unavailable", reason: "no-baseline" }}
      onSelect={onSelect}
    />,
  )

  expect(screen.getByRole("tab", { name: "Rendered" })).toHaveAttribute("aria-selected", "true")
  expect(screen.queryByText("# Title")).not.toBeInTheDocument()

  fireEvent.click(screen.getByText("Open local file."))
  expect(onSelect).toHaveBeenLastCalledWith({
    lineStart: 3,
    lineEnd: 3,
    selectedText: "- Open local file.",
  })

  fireEvent.click(screen.getByRole("button", { name: "Add note at line 3" }))
  expect(onSelect).toHaveBeenLastCalledWith({
    lineStart: 3,
    lineEnd: 3,
    selectedText: "- Open local file.",
  })

  fireEvent.click(screen.getByRole("tab", { name: "Source" }))
  expect(screen.getByText("# Title")).toBeInTheDocument()

  fireEvent.click(screen.getByRole("button", { name: "Add note at line 1" }))
  expect(onSelect).toHaveBeenLastCalledWith({
    lineStart: 1,
    lineEnd: 1,
    selectedText: "# Title",
  })
})

test("Rendered marks exact changed items without leaking its label into selected text", () => {
  const onSelect = vi.fn()
  const { rerender } = render(
    <ReaderPane
      document={documentFixture}
      review={reviewFixture}
      selection={{ lineStart: 0, lineEnd: 0, selectedText: "" }}
      sourceState="changed"
      comparison={{
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
      }}
      onSelect={onSelect}
    />,
  )
  fireEvent.click(screen.getByRole("tab", { name: "Rendered" }))
  const changedItem = screen.getByText("Open local file.").closest("[data-change]")
  expect(changedItem).toHaveAttribute("data-change", "current")
  expect(changedItem?.tagName).toBe("LI")
  expect(screen.getByText("Changed", { selector: ".rendered-change-label" })).toBeInTheDocument()
  expect(changedItem?.closest(".markdown-block")).not.toHaveAttribute("data-change")
  expect(screen.getAllByRole("heading", { name: "Title" })[1]?.closest("[data-change]"))
    .toBeNull()
  const range = document.createRange()
  range.selectNodeContents(changedItem!)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(range)
  fireEvent.mouseUp(changedItem!.closest(".markdown-body")!)
  expect(onSelect).toHaveBeenLastCalledWith({ lineStart: 3, lineEnd: 3, selectedText: "Open local file." })
  window.getSelection()?.removeAllRanges()
  rerender(
    <ReaderPane
      document={documentFixture}
      review={reviewFixture}
      selection={{ lineStart: 3, lineEnd: 3, selectedText: "- Open local file." }}
      sourceState="changed"
      comparison={changedComparison}
      onSelect={onSelect}
    />,
  )
  fireEvent.click(screen.getByRole("tab", { name: "Rendered" }))
  expect(screen.getByText("Open local file.").closest(".markdown-block")).toHaveClass("selected")
  rerender(
    <ReaderPane
      document={documentFixture}
      review={reviewFixture}
      selection={{ lineStart: 1, lineEnd: 1, selectedText: "# Title" }}
      sourceState="changed"
      comparison={headingChangedComparison}
      onSelect={onSelect}
    />,
  )
  fireEvent.click(screen.getByRole("tab", { name: "Rendered" }))
  const headingBlock = screen.getAllByRole("heading", { name: "Title" })[1]?.closest(".markdown-block")
  expect(headingBlock).toHaveClass("selected", "changed")
  expect(headingBlock?.querySelector(".rendered-change-label")).toHaveTextContent("Changed")
})

test("opening an annotation switches from Changes before scrolling to its rendered anchor", async () => {
  const scrollIntoView = vi.fn()
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView })
  const selection = { lineStart: 0, lineEnd: 0, selectedText: "" }
  render(
    <Workspace
      document={documentFixture}
      review={{
        ...reviewFixture,
        annotations: [{
          id: "unchanged-note",
          lineStart: 99,
          lineEnd: 99,
          section: "Title",
          selectedText: "# Title",
          kind: "issue",
          severity: "major",
          status: "open",
          note: "Unchanged line note",
          agentAction: "",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          anchorState: "moved",
          anchor: { state: "moved", lineStart: 1, lineEnd: 1, sourceText: "# Title" },
        }],
      }}
      selection={selection}
      sourceState="changed"
      comparison={changedComparison}
      form={emptyForm(selection)}
      exportMarkdown=""
      exportLoading={false}
      saving={false}
      onSelection={vi.fn()}
      onFormChange={vi.fn()}
      onFormSubmit={vi.fn()}
      onFormReset={vi.fn()}
      onEditAnnotation={vi.fn()}
      onStatusAnnotation={vi.fn()}
      onDeleteAnnotation={vi.fn()}
      onCopyExport={vi.fn()}
    />,
  )
  expect(screen.getByRole("tab", { name: /Changes/ })).toHaveAttribute("aria-selected", "true")
  expect(document.querySelector('[data-source-line="1"]')).toBeNull()
  fireEvent.click(screen.getByText("Unchanged line note"))

  await waitFor(() => expect(screen.getByRole("tab", { name: "Rendered" })).toHaveAttribute("aria-selected", "true"))
  await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" }))
  fireEvent.click(screen.getByRole("tab", { name: /Changes/ }))
  await waitFor(() => expect(screen.getByRole("tab", { name: /Changes/ })).toHaveAttribute("aria-selected", "true"))
})

const changedComparison = {
  state: "diff" as const,
  roundId: "1750000000000-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  completedAt: "2025-06-15T15:06:40.000Z",
  beforeDigest: "a".repeat(64),
  afterDigest: "b".repeat(64),
  added: 1,
  removed: 1,
  rows: [
    { kind: "remove" as const, oldLine: 3, newLine: null, text: "Old line" },
    { kind: "add" as const, oldLine: null, newLine: 3, text: "- Open local file." },
  ],
}

const headingChangedComparison = {
  ...changedComparison,
  roundId: "1750000000001-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  rows: [
    { kind: "remove" as const, oldLine: 1, newLine: null, text: "# Old title" },
    { kind: "add" as const, oldLine: null, newLine: 1, text: "# Title" },
  ],
}

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
  documentPath: "/tmp/spec.md",
  documentDigest: "digest",
  revision: 0,
  summary: "",
  annotations: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  metrics: { activeMs: 0 },
}
