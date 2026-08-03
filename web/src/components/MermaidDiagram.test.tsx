import { render, waitFor } from "@testing-library/react"
import { expect, test, vi } from "vitest"
import { MermaidDiagram } from "@/components/MermaidDiagram"

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn().mockResolvedValue({ svg: '<svg><circle onclick="alert(1)" /></svg>' }),
}))

vi.mock("mermaid", () => ({ default: mermaid }))

test("renders Mermaid as sanitized static SVG with strict configuration", async () => {
  const source = "flowchart TD\n  A --> B"
  const { container } = render(<MermaidDiagram source={source} />)

  await waitFor(() => expect(container.querySelector("svg")).not.toBeNull())

  expect(mermaid.render).toHaveBeenCalledWith(expect.stringMatching(/^spec-reviewer-mermaid-/), source)
  expect(mermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({
    securityLevel: "strict",
    htmlLabels: false,
    maxTextSize: 50_000,
    maxEdges: 1_000,
  }))
  expect(container.innerHTML).not.toContain("onclick")
})
