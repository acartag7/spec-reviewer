import { render, screen } from "@testing-library/react"
import { expect, test, vi } from "vitest"
import { TopBar } from "@/components/TopBar"
import { TooltipProvider } from "@/components/ui/tooltip"

test("shows the current file and honors terminal action gates", () => {
  render(
    <TooltipProvider>
      <TopBar
        path="/tmp/spec.md"
        sourceState="current"
        canCopy={false}
        canFinish={false}
        waitForReview
        finishing={false}
        openNotes={2}
        onCopy={vi.fn()}
        onFinish={vi.fn()}
        onCancel={vi.fn()}
      />
    </TooltipProvider>,
  )

  expect(screen.getByRole("button", { name: "Copy feedback" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "Finish review" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "Cancel review" })).toBeEnabled()
  expect(screen.getByLabelText("Current document: /tmp/spec.md")).toHaveTextContent("tmp/spec.md")
  expect(screen.getByRole("heading", { name: "Current document: /tmp/spec.md" })).toBeInTheDocument()
  expect(screen.getByText("2 open")).toBeInTheDocument()
})
