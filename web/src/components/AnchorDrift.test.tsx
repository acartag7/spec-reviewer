import { render, screen } from "@testing-library/react"
import { expect, test, vi } from "vitest"
import type { Annotation } from "@/api/types"
import { AgentExport } from "@/components/AgentExport"
import { AnnotationList } from "@/components/AnnotationList"
import { SourceStateBanner } from "@/components/SourceState"

test("shows per-annotation anchor state when API provides it", () => {
  render(
    <AnnotationList
      annotations={[
        annotation({ id: "a1", anchorState: "ok" }),
        annotation({ id: "a2", anchor: { state: "moved", lineStart: 8, lineEnd: 9 } }),
        annotation({ id: "a3", anchorState: "not-found" }),
      ]}
      onOpen={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  )

  expect(screen.getByText("anchor ok")).toBeInTheDocument()
  expect(screen.getByText("moved to L8-9")).toBeInTheDocument()
  expect(screen.getByText("anchor not found")).toBeInTheDocument()
})

test("keeps a persistent banner when any annotation anchors drift", () => {
  render(
    <SourceStateBanner
      state="current"
      annotations={[
        annotation({ id: "a1", anchorState: "moved" }),
        annotation({ id: "a2", anchorState: "not-found" }),
      ]}
    />,
  )

  expect(screen.getByRole("alert")).toHaveTextContent("Anchor drift detected: 1 moved, 1 not found")
})

test("makes export warnings visible for drifted anchors", () => {
  render(
    <AgentExport
      markdown="# Agent Review Feedback"
      loading={false}
      annotations={[annotation({ anchorState: "moved" })]}
      onCopy={vi.fn()}
    />,
  )

  expect(screen.getByRole("alert")).toHaveTextContent("Review anchors before copying export: 1 moved.")
})

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: "a1",
    lineStart: 4,
    lineEnd: 4,
    section: null,
    selectedText: "selected",
    kind: "issue",
    severity: "major",
    status: "open",
    note: "Review this line",
    agentAction: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}
