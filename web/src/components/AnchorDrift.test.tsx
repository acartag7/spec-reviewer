import { fireEvent, render, screen } from "@testing-library/react"
import { expect, test, vi } from "vitest"
import type { Annotation } from "@/api/types"
import { AgentExport } from "@/components/AgentExport"
import { AnnotationList } from "@/components/AnnotationList"
import { SourceStateBanner } from "@/components/SourceState"

test("shows actionable anchor drift without adding healthy-state noise", () => {
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
      onStatusChange={vi.fn()}
    />,
  )

  expect(screen.queryByText("anchor ok")).not.toBeInTheDocument()
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

test("keeps not-found notes open until the human resolves them", () => {
  render(
    <AnnotationList
      annotations={[
        annotation({ id: "current", anchorState: "ok", note: "Current note" }),
        annotation({ id: "prior", anchorState: "not-found", note: "Prior note" }),
      ]}
      onOpen={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onStatusChange={vi.fn()}
    />,
  )

  expect(screen.queryByText("Previous version")).not.toBeInTheDocument()
  expect(screen.getByText("Current note")).toBeInTheDocument()
  expect(screen.getByText("Prior note")).toBeInTheDocument()
})

test("keeps not-found notes in the main list when the review is current", () => {
  render(
    <AnnotationList
      annotations={[annotation({ id: "a1", anchorState: "not-found", note: "Still actionable" })]}
      onOpen={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onStatusChange={vi.fn()}
    />,
  )

  expect(screen.queryByText("Previous version")).not.toBeInTheDocument()
  expect(screen.getByText("Still actionable")).toBeInTheDocument()
})

test("resolves an annotation only through an explicit human action", () => {
  const onStatusChange = vi.fn()
  const open = annotation({ note: "Needs confirmation" })
  render(
    <AnnotationList
      annotations={[open]}
      onOpen={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onStatusChange={onStatusChange}
    />,
  )

  fireEvent.click(screen.getByRole("button", { name: "Resolve" }))
  expect(onStatusChange).toHaveBeenCalledWith(open, "resolved")
})

test("opens a note through its keyboard-accessible source range control", () => {
  const onOpen = vi.fn()
  const open = annotation()
  render(
    <AnnotationList
      annotations={[open]}
      onOpen={onOpen}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onStatusChange={vi.fn()}
    />,
  )

  fireEvent.click(screen.getByRole("button", { name: "L4" }))
  expect(onOpen).toHaveBeenCalledWith(open)
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
