import { fireEvent, render, screen } from "@testing-library/react"
import { expect, test, vi } from "vitest"
import type { Review, ReviewDocument } from "@/api/types"
import { ReaderPane } from "@/components/ReaderPane"

test("source documents open in source view and keep line notes", () => {
  const onSelect = vi.fn()
  render(
    <ReaderPane
      document={yamlDocument}
      review={reviewFixture}
      selection={{ lineStart: 0, lineEnd: 0, selectedText: "" }}
      sourceState="current"
      comparison={{ state: "unavailable", reason: "no-baseline" }}
      onSelect={onSelect}
    />,
  )

  expect(screen.queryByRole("tab", { name: "Rendered" })).not.toBeInTheDocument()
  expect(screen.getByRole("tab", { name: "Source" })).toHaveAttribute("aria-selected", "true")
  expect(screen.getByText("# service config")).toBeInTheDocument()
  expect(screen.queryByRole("heading", { name: "service config" })).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole("button", { name: "Add note at line 2" }))
  expect(onSelect).toHaveBeenLastCalledWith({
    lineStart: 2,
    lineEnd: 2,
    selectedText: "name: demo",
  })
})

const yamlDocument: ReviewDocument = {
  path: "/tmp/plan.yaml",
  title: "plan.yaml",
  digest: "digest",
  format: "source",
  sections: [],
  lines: [
    { number: 1, text: "# service config", kind: "normal", sectionTitle: null },
    { number: 2, text: "name: demo", kind: "normal", sectionTitle: null },
  ],
}

const reviewFixture: Review = {
  documentPath: "/tmp/plan.yaml",
  documentDigest: "digest",
  revision: 0,
  summary: "",
  annotations: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  metrics: { activeMs: 0 },
}
