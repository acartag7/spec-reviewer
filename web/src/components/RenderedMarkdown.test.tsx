import { render, screen } from "@testing-library/react"
import { expect, test } from "vitest"
import type { Review, ReviewDocument } from "@/api/types"
import { RenderedMarkdown } from "@/components/RenderedMarkdown"

test("marks a changed Mermaid fence at its containing rendered block", () => {
  render(
    <RenderedMarkdown
      document={documentFixture}
      review={reviewFixture}
      selection={{ lineStart: 0, lineEnd: 0, selectedText: "" }}
      comparison={{
        state: "diff",
        roundId: "1750000000000-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        completedAt: "2025-06-15T15:06:40.000Z",
        beforeDigest: "a".repeat(64),
        afterDigest: "b".repeat(64),
        added: 1,
        removed: 1,
        rows: [
          { kind: "remove", oldLine: 2, newLine: null, text: "  A --> C" },
          { kind: "add", oldLine: null, newLine: 2, text: "  A --> B" },
        ],
      }}
      onSelect={() => {}}
    />,
  )

  const block = screen.getByText("Rendering diagram…").closest(".markdown-block")
  expect(block).toHaveAttribute("data-change", "current")
  expect(block).toHaveTextContent("Changed")
})

const documentFixture: ReviewDocument = {
  path: "/tmp/spec.md",
  title: "Spec",
  digest: "digest",
  sections: [],
  lines: [
    { number: 1, text: "```mermaid", kind: "code", sectionTitle: null },
    { number: 2, text: "  A --> B", kind: "code", sectionTitle: null },
    { number: 3, text: "```", kind: "code", sectionTitle: null },
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
