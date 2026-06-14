import { render, screen } from "@testing-library/react"
import { expect, test, vi } from "vitest"
import App from "./App"

test("renders the top bar and start screen", async () => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const path = String(input)
    if (path === "/api/config") return json({ defaultDocumentPath: null })
    if (path === "/api/reviews") return json([])
    return json({ error: { message: "not found" } }, 404)
  })

  render(<App />)

  expect(await screen.findByText("Spec Reviewer")).toBeInTheDocument()
  expect(await screen.findByText("Review a Markdown spec")).toBeInTheDocument()
  expect(await screen.findByText("No saved reviews yet.")).toBeInTheDocument()
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}
