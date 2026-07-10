import { fireEvent, render, screen, within } from "@testing-library/react"
import { expect, test, vi } from "vitest"
import type { SelectionRange } from "@/api/types"
import { AnnotationPanel, resetForm } from "@/components/AnnotationPanel"

test("annotation controls expose radio state", () => {
  const selection: SelectionRange = { lineStart: 2, lineEnd: 2, selectedText: "selected text" }
  const onChange = vi.fn()
  const form = { ...resetForm(selection), note: "Needs a sharper constraint." }

  render(
    <AnnotationPanel
      form={form}
      selection={selection}
      maxLine={20}
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
})

test("editing a resolved note keeps its status visible and offers an explicit reopen", () => {
  const selection: SelectionRange = { lineStart: 2, lineEnd: 2, selectedText: "selected text" }
  const onChange = vi.fn()
  const form = { ...resetForm(selection), id: "ann_1", status: "resolved" as const, note: "Done" }

  render(
    <AnnotationPanel
      form={form}
      selection={selection}
      maxLine={20}
      saving={false}
      onChange={onChange}
      onSubmit={vi.fn()}
      onReset={vi.fn()}
    />,
  )

  expect(screen.getByText("Editing a resolved note. Saving keeps it resolved.")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Reopen for agent" }))
  expect(onChange).toHaveBeenLastCalledWith({ ...form, status: "open" })
})
