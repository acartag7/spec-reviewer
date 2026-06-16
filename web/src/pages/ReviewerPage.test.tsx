import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { expect, test, vi } from "vitest"
import { ReviewerPage } from "@/pages/ReviewerPage"
import { TooltipProvider } from "@/components/ui/tooltip"

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

test("clicking Finish in a wait session replaces the workspace with the submitted outcome screen", async () => {
  const document = {
    path: "/tmp/spec.md",
    title: "Spec",
    digest: "abc",
    lines: [{ number: 1, text: "# Spec", kind: "heading", sectionTitle: "Spec" }],
    sections: [{ line: 1, level: 1, title: "Spec" }],
  }
  const review = { documentPath: "/tmp/spec.md", documentDigest: "abc", summary: "", annotations: [], createdAt: "t", updatedAt: "t" }
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    if (url === "/api/config") return json({ defaultDocumentPath: null, waitForReview: true })
    if (url === "/api/reviews") return json([])
    if (url.startsWith("/api/document?")) return json({ document, review, stale: false, sourceState: "current" })
    if (url.startsWith("/api/export?")) return json({ markdown: "# Agent Review Feedback", openAnnotations: 0, carriedOver: 0 })
    if (url === "/api/session/finish" && method === "POST") {
      return json({ status: "finished", path: "/tmp/spec.md", markdown: "# Agent Review Feedback", openAnnotations: 2, carriedOver: 1 })
    }
    return json({ error: { message: "not found" } }, 404)
  })

  const close = vi.spyOn(window, "close").mockImplementation(() => {})
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/?path=/tmp/spec.md"]}>
          <ReviewerPage />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  )

  const finish = await screen.findByRole("button", { name: /Finish review/i })
  await waitFor(() => expect(finish).not.toBeDisabled())
  fireEvent.click(finish)

  expect(await screen.findByText("Review submitted")).toBeInTheDocument()
  expect(await screen.findByText(/2 live/)).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: /Finish review/i })).not.toBeInTheDocument()
  close.mockRestore()
})
