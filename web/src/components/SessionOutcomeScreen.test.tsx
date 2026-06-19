import { render, screen } from "@testing-library/react"
import { expect, test, vi } from "vitest"
import { SessionOutcomeScreen } from "@/components/SessionOutcomeScreen"

test("finished outcome shows the submitted state, counts, active time, and closes the window", () => {
  const close = vi.spyOn(window, "close").mockImplementation(() => {})
  render(<SessionOutcomeScreen outcome="finished" openAnnotations={2} carriedOver={3} activeMs={125000} />)

  expect(screen.getByText("Review submitted")).toBeInTheDocument()
  expect(screen.getByText(/2 live/)).toBeInTheDocument()
  expect(screen.getByText(/3 carried over/)).toBeInTheDocument()
  expect(screen.getByText(/2m 05s/)).toBeInTheDocument()
  expect(close).toHaveBeenCalled()
  close.mockRestore()
})

test("canceled outcome shows the canceled state without counts", () => {
  const close = vi.spyOn(window, "close").mockImplementation(() => {})
  render(<SessionOutcomeScreen outcome="canceled" />)

  expect(screen.getByText("Review canceled")).toBeInTheDocument()
  expect(screen.getByText(/No feedback was sent/)).toBeInTheDocument()
  close.mockRestore()
})
