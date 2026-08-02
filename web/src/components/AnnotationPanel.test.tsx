import { fireEvent, render, screen, within } from "@testing-library/react"
import { expect, test, vi } from "vitest"
import type { SelectionRange } from "@/api/types"
import { AnnotationPanel } from "@/components/AnnotationPanel"
import { emptyForm } from "@/lib/review-utils"

test("annotation controls expose radio state", () => {
  const selection: SelectionRange = { lineStart: 2, lineEnd: 2, selectedText: "selected text" }
  const onChange = vi.fn()
  const form = { ...emptyForm(selection), note: "Needs a sharper constraint." }

  render(
    <AnnotationPanel
      form={form}
      selection={selection}
      maxLine={10}
      saving={false}
      onChange={onChange}
      onSubmit={vi.fn()}
      onReset={vi.fn()}
    />,
  )

  const severity = screen.getByRole("radiogroup", { name: "Severity" })
  expect(within(severity).getByRole("radio", { name: "Major" })).toHaveAttribute("aria-checked", "true")

  fireEvent.click(within(severity).getByRole("radio", { name: "Blocker" }))
  expect(onChange).toHaveBeenLastCalledWith({ ...form, severity: "blocker" })

  const kind = screen.getByRole("radiogroup", { name: "Type" })
  expect(within(kind).getByRole("radio", { name: "Issue" })).toHaveAttribute("aria-checked", "true")

  fireEvent.click(within(kind).getByRole("radio", { name: "Question" }))
  expect(onChange).toHaveBeenLastCalledWith({ ...form, kind: "question" })
  expect(screen.getByRole("textbox", { name: "Agent action (optional)" })).toHaveValue("")
  expect(screen.getByText("selected text")).toBeInTheDocument()
})

test("allows only an unchanged saved range outside the shortened document", () => {
  const selection: SelectionRange = { lineStart: 1, lineEnd: 1, selectedText: "" }
  const form = { ...emptyForm(selection), id: "saved", createdAt: "t", lineStart: 8, lineEnd: 9, note: "Keep this note" }
  const props = {
    form,
    selection,
    maxLine: 3,
    saving: false,
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    onReset: vi.fn(),
  }
  const { rerender } = render(<AnnotationPanel {...props} allowStoredRange />)
  expect(screen.getByRole("button", { name: "Update note" })).toBeEnabled()
  expect(screen.getByRole("alert")).toHaveTextContent("saved range is outside the current document")
  const rangeDetails = screen.getByText("Adjust source range").closest("details")
  expect(rangeDetails).toHaveAttribute("open")
  fireEvent.click(screen.getByText("Adjust source range"))
  expect(rangeDetails).not.toHaveAttribute("open")

  rerender(<AnnotationPanel {...props} form={{ ...form, lineStart: 7 }} allowStoredRange={false} />)
  expect(screen.getByRole("button", { name: "Update note" })).toBeDisabled()
  expect(screen.getByRole("alert")).toHaveTextContent("Choose lines from 1 to 3")
})

test("reopens a resolved note from the editor", () => {
  const selection: SelectionRange = { lineStart: 1, lineEnd: 1, selectedText: "" }
  const form = { ...emptyForm(selection), id: "saved", createdAt: "t", status: "resolved" as const }
  const onChange = vi.fn()
  render(<AnnotationPanel form={form} selection={selection} maxLine={2} saving={false} onChange={onChange} onSubmit={vi.fn()} onReset={vi.fn()} />)
  fireEvent.click(screen.getByRole("button", { name: "Mark open" }))
  expect(onChange).toHaveBeenCalledWith({ ...form, status: "open" })
})

test("explains the empty initial target and an empty document", () => {
  const selection: SelectionRange = { lineStart: 0, lineEnd: 0, selectedText: "" }
  render(<AnnotationPanel form={emptyForm({ lineStart: 1, lineEnd: 1, selectedText: "" })} selection={selection} maxLine={0} saving={false} onChange={vi.fn()} onSubmit={vi.fn()} onReset={vi.fn()} />)
  expect(screen.getByText("No source selected")).toBeInTheDocument()
  expect(screen.getByRole("alert")).toHaveTextContent("no source lines to annotate")
  expect(screen.getByRole("button", { name: "Add note" })).toBeDisabled()
})

test("requires an explicit source target before adding feedback", () => {
  const selection: SelectionRange = { lineStart: 0, lineEnd: 0, selectedText: "" }
  render(<AnnotationPanel form={emptyForm({ lineStart: 1, lineEnd: 1, selectedText: "" })} selection={selection} maxLine={2} saving={false} onChange={vi.fn()} onSubmit={vi.fn()} onReset={vi.fn()} />)
  expect(screen.getByRole("heading", { name: "Feedback annotation", level: 3 })).toBeInTheDocument()
  expect(screen.getByRole("alert")).toHaveTextContent("Select source lines")
  expect(screen.getByRole("button", { name: "Add note" })).toBeDisabled()
  fireEvent.click(screen.getByText("Adjust source range"))
  fireEvent.input(screen.getByRole("spinbutton", { name: "From line" }), { target: { value: "1" } })
  expect(screen.getByRole("button", { name: "Add note" })).toBeEnabled()
})
