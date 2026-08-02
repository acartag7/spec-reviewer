import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { expect, test, vi } from "vitest"
import type { Review, ReviewComparison, ReviewDocument, SelectionRange } from "@/api/types"
import { ChangesView } from "@/components/ChangesView"
import { ReaderPane } from "@/components/ReaderPane"

const comparison: ReviewComparison = {
  state: "diff",
  roundId: "1750000000000-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  completedAt: "2025-06-15T15:06:40.000Z",
  beforeDigest: "a".repeat(64),
  afterDigest: "b".repeat(64),
  added: 1,
  removed: 1,
  rows: [
    { kind: "remove", oldLine: 2, newLine: null, text: "old\u202Etext\r\u2028\u{E007F}é 漢字 👩‍💻" },
    { kind: "add", oldLine: null, newLine: 2, text: "  <img src=x onerror=alert(1)>  " },
    { kind: "gap", hiddenOld: 8, hiddenNew: 9 },
    { kind: "no-newline", oldLine: null, newLine: null, text: "No newline at end of file" },
  ],
}

test("Changes renders textual change evidence, safe text, gap counts, and visible controls", () => {
  render(<ChangesView comparison={comparison} document={documentFixture} selection={emptySelection} onSelect={vi.fn()} />)
  expect(screen.getByRole("region", { name: "Changes: 1 added, 1 removed" })).toBeInTheDocument()
  expect(screen.getByRole("row", { name: "Removed, minus marker, old line 2" })).toHaveTextContent("−")
  expect(screen.getByRole("row", { name: "Added, plus marker, new line 2" })).toHaveTextContent("+")
  expect(screen.getByText("old[U+202E]text[U+000D][U+2028][U+E007F]é 漢字 👩‍💻")).toBeInTheDocument()
  expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument()
  expect(document.querySelector("img")).toBeNull()
  expect(screen.getByLabelText("Collapsed gap: 8 old lines and 9 new lines hidden")).toBeInTheDocument()
  expect(screen.getByText("No newline at end of file")).toBeInTheDocument()
})

test("selecting a current-side diff row populates exact current source evidence", () => {
  const onSelect = vi.fn()
  const { rerender } = render(<ChangesView comparison={comparison} document={documentFixture} selection={emptySelection} onSelect={onSelect} />)
  expect(screen.getByRole("row", { name: "Added, plus marker, new line 2" }).className).not.toContain("shadow-")
  const addedText = screen.getByText("<img src=x onerror=alert(1)>")
  fireEvent.click(addedText)
  expect(onSelect).toHaveBeenLastCalledWith({
    lineStart: 2,
    lineEnd: 2,
    selectedText: "  <img src=x onerror=alert(1)>  ",
  })
  onSelect.mockClear()
  fireEvent.click(screen.getByText("old[U+202E]text[U+000D][U+2028][U+E007F]é 漢字 👩‍💻"))
  expect(onSelect).not.toHaveBeenCalled()

  const range = document.createRange()
  range.selectNodeContents(addedText)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(range)
  fireEvent.mouseUp(screen.getByRole("region", { name: "Changes: 1 added, 1 removed" }))
  expect(onSelect).toHaveBeenCalledWith({
    lineStart: 2,
    lineEnd: 2,
    selectedText: "  <img src=x onerror=alert(1)>  ",
  })
  window.getSelection()?.removeAllRanges()
  rerender(<ChangesView
    comparison={comparison}
    document={documentFixture}
    selection={{ lineStart: 2, lineEnd: 2, selectedText: documentFixture.lines[1]!.text }}
    onSelect={onSelect}
  />)
  expect(screen.getByRole("row", { name: "Added, plus marker, new line 2" }).className).toContain("shadow-")
})

test("a real diff defaults to Changes and Radix provides APG arrow navigation", async () => {
  render(
    <ReaderPane
      document={documentFixture}
      review={reviewFixture}
      selection={{ lineStart: 1, lineEnd: 1, selectedText: "" }}
      sourceState="changed"
      comparison={comparison}
      onSelect={vi.fn()}
    />,
  )
  const changes = screen.getByRole("tab", { name: "Changes, 1 added, 1 removed" })
  expect(changes).toHaveAttribute("aria-selected", "true")
  await act(async () => {
    changes.focus()
    fireEvent.keyDown(changes, { key: "ArrowRight" })
  })
  await waitFor(() => expect(screen.getByRole("tab", { name: "Rendered" })).toHaveFocus())
  fireEvent.keyDown(screen.getByRole("tab", { name: "Rendered" }), { key: "End" })
  await waitFor(() => expect(changes).toHaveFocus())
  fireEvent.keyDown(changes, { key: "Home" })
  await waitFor(() => expect(screen.getByRole("tab", { name: "Rendered" })).toHaveFocus())
  expect(screen.getAllByRole("tabpanel")).toHaveLength(1)
})

test("unavailable and bounded comparisons state why no diff is shown", () => {
  const { rerender } = render(<ChangesView comparison={{ state: "unavailable", reason: "no-baseline" }} document={documentFixture} selection={emptySelection} onSelect={vi.fn()} />)
  expect(screen.getByText("No completed review baseline is available.")).toBeInTheDocument()
  rerender(<ChangesView comparison={{
    state: "too-large",
    roundId: "1750000000000-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    completedAt: "2025-06-15T15:06:40.000Z",
    beforeDigest: "a".repeat(64),
    afterDigest: "b".repeat(64),
    added: null,
    removed: null,
    rows: [],
  }} document={documentFixture} selection={emptySelection} onSelect={vi.fn()} />)
  expect(screen.getByText("Changes are too large to display safely.")).toBeInTheDocument()
})

const documentFixture: ReviewDocument = {
  path: "/tmp/spec.md",
  title: "Spec",
  digest: "b".repeat(64),
  sections: [{ line: 1, level: 1, title: "Spec" }],
  lines: [
    { number: 1, text: "# Spec", kind: "heading", sectionTitle: "Spec" },
    { number: 2, text: "  <img src=x onerror=alert(1)>  ", kind: "normal", sectionTitle: "Spec" },
  ],
}

const emptySelection: SelectionRange = { lineStart: 0, lineEnd: 0, selectedText: "" }

const reviewFixture: Review = {
  documentPath: documentFixture.path,
  documentDigest: "a".repeat(64),
  revision: 0,
  summary: "",
  annotations: [],
  createdAt: "2025-06-15T15:00:00.000Z",
  updatedAt: "2025-06-15T15:00:00.000Z",
  metrics: { activeMs: 0 },
}
