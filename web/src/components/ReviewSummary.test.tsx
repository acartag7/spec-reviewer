import { fireEvent, render, screen } from "@testing-library/react"
import { expect, test, vi } from "vitest"
import { ReviewSummary } from "@/components/ReviewSummary"

test("blocks a summary that exceeds the server byte limit", () => {
  const onSave = vi.fn()
  const onRevert = vi.fn()
  render(
    <ReviewSummary
      value={"é".repeat(32_769)}
      dirty
      saving={false}
      onChange={vi.fn()}
      onRevert={onRevert}
      onSave={onSave}
    />,
  )

  expect(screen.getByRole("alert")).toHaveTextContent("65,538 bytes; the limit is 65,536")
  expect(screen.getByRole("textbox", { name: "Overall assessment" })).toHaveAttribute("aria-invalid", "true")
  fireEvent.click(screen.getByRole("button", { name: "Save summary" }))
  expect(onSave).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Revert" }))
  expect(onRevert).toHaveBeenCalledOnce()
  expect(screen.getByRole("heading", { name: "Overall assessment", level: 3 })).toBeInTheDocument()
})
