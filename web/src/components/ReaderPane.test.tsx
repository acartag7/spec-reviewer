import { fireEvent, render, screen } from "@testing-library/react"
import { expect, test, vi } from "vitest"
import type { Review, ReviewDocument } from "@/api/types"
import { ReaderPane } from "@/components/ReaderPane"

test("renders markdown by default and keeps source-line click anchors", () => {
  const onSelect = vi.fn()
  render(
    <ReaderPane
      document={documentFixture}
      review={reviewFixture}
      selection={{ lineStart: 1, lineEnd: 1, selectedText: "" }}
      sourceState="current"
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

  fireEvent.click(screen.getByRole("tab", { name: "Source" }))
  expect(screen.getByText("# Title")).toBeInTheDocument()
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
  documentPath: "/tmp/spec.md",
  documentDigest: "digest",
  summary: "",
  annotations: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}
