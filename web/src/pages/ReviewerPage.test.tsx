import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, expect, test, vi } from "vitest"
import { ReviewerPage } from "@/pages/ReviewerPage"
import { TooltipProvider } from "@/components/ui/tooltip"

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(document, "hasFocus", { value: () => false, configurable: true })
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true })
})

test("Finish in a wait session flushes active time into the request body before unmount", async () => {
  vi.useFakeTimers()
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true })
  Object.defineProperty(document, "hasFocus", { value: () => true, configurable: true })
  const documentFixture = {
    path: "/tmp/spec.md",
    title: "Spec",
    digest: "abc",
    lines: [{ number: 1, text: "# Spec", kind: "heading", sectionTitle: "Spec" }],
    sections: [{ line: 1, level: 1, title: "Spec" }],
  }
  const review = { documentPath: "/tmp/spec.md", documentDigest: "abc", summary: "", annotations: [], createdAt: "t", updatedAt: "t", metrics: { activeMs: 0 } }
  let finishBody: { activeMsDelta?: number } | null = null
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    if (url === "/api/config") return json({ defaultDocumentPath: null, waitForReview: true })
    if (url === "/api/reviews") return json([])
    if (url.startsWith("/api/document?")) return json({ document: documentFixture, review, stale: false, sourceState: "current" })
    if (url.startsWith("/api/export?")) return json({ markdown: "# Agent Review Feedback", openAnnotations: 0, carriedOver: 0 })
    if (url === "/api/session/finish" && method === "POST") {
      finishBody = JSON.parse(init?.body as string)
      return json({ status: "finished", path: "/tmp/spec.md", markdown: "# Agent Review Feedback", openAnnotations: 2, carriedOver: 1, activeMs: finishBody?.activeMsDelta ?? 0 })
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

  // Load the document and arm the tracker first (a sub-tick advance flushes the query microtasks
  // without firing the 1s heartbeat), then accumulate a few seconds of active time.
  await act(async () => { await vi.advanceTimersByTimeAsync(50) })
  await act(async () => { vi.advanceTimersByTime(3000) })
  fireEvent.click(screen.getByRole("button", { name: /Finish review/i }))
  await act(async () => { await vi.advanceTimersByTimeAsync(50) })

  // The flush must run BEFORE the workspace unmounts, so the delta reaches the finish body.
  expect(finishBody).not.toBeNull()
  expect(finishBody!.activeMsDelta).toBeGreaterThan(0)
  expect(screen.getByText("Review submitted")).toBeInTheDocument()
  expect(screen.getByText(/2 live/)).toBeInTheDocument()
  close.mockRestore()
})
