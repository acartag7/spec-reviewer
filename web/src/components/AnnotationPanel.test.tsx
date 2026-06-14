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

  const kind = screen.getByRole("radiogroup", { name: "Kind" })
  expect(within(kind).getByRole("radio", { name: "Issue" })).toHaveAttribute("aria-checked", "true")

  fireEvent.click(within(kind).getByRole("radio", { name: "Question" }))
  expect(onChange).toHaveBeenLastCalledWith({ ...form, kind: "question" })
})
