import { fireEvent, render, screen } from "@testing-library/react"
import { expect, test } from "vitest"
import { ArtifactPreview } from "@/components/ArtifactPreview"

test("keeps artifact previews click-to-render in a sandboxed iframe", () => {
  render(<ArtifactPreview artifact={{ kind: "svg", html: "<svg><circle /></svg>", source: "<svg><circle /></svg>" }} />)

  expect(screen.queryByTitle("svg artifact preview")).not.toBeInTheDocument()
  expect(screen.getByText("<svg><circle /></svg>")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Preview" }))
  expect(screen.queryByTitle("svg artifact preview")).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole("button", { name: "Render sandboxed preview" }))
  const frame = screen.getByTitle("svg artifact preview")

  expect(frame).toHaveAttribute("sandbox", "")
  expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin")
})
