import { render, screen } from "@testing-library/react"
import { expect, test, vi } from "vitest"
import { TopBar } from "@/components/TopBar"
import { TooltipProvider } from "@/components/ui/tooltip"

test("copy and finish stay disabled while feedback is saving", () => {
  render(
    <TooltipProvider>
      <TopBar
        path="/tmp/spec.md"
        sourceState="current"
        canCopy
        waitForReview
        finishing={false}
        saving
        openNotes={1}
        onCopy={vi.fn()}
        onFinish={vi.fn()}
        onCancel={vi.fn()}
      />
    </TooltipProvider>,
  )

  expect(screen.getByRole("button", { name: "Copy feedback" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "Finish review" })).toBeDisabled()
  expect(screen.getByLabelText("Current document: /tmp/spec.md")).toHaveTextContent("tmp/spec.md")
})
