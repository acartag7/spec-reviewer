import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
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
  const review = { documentPath: "/tmp/spec.md", documentDigest: "abc", revision: 0, summary: "", annotations: [], createdAt: "t", updatedAt: "t", metrics: { activeMs: 0 } }
  let finishBody: { activeMsDelta?: number } | null = null
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    if (url === "/api/config") return json({ defaultDocumentPath: "/tmp/spec.md", waitForReview: true })
    if (url === "/api/reviews") return json([])
    if (url.startsWith("/api/document?")) return json({ document: documentFixture, review, stale: false, sourceState: "current" })
    if (url.startsWith("/api/export?")) return json({ markdown: "# Agent Review Feedback", openAnnotations: 0, carriedOver: 0 })
    if (url === "/api/session/finish" && method === "POST") {
      finishBody = JSON.parse(init?.body as string)
      return json({ status: "finished", path: "/tmp/spec.md", markdown: "# Agent Review Feedback", openAnnotations: 2, carriedOver: 0, activeMs: finishBody?.activeMsDelta ?? 0 })
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
  expect(screen.getByText(/2 open/)).toBeInTheDocument()
  close.mockRestore()
})

test("a rejected stale save reloads server state and allows the next save", async () => {
  const documentFixture = {
    path: "/tmp/spec.md",
    title: "Spec",
    digest: "abc",
    lines: [
      { number: 1, text: "# Spec", kind: "heading", sectionTitle: "Spec" },
      { number: 2, text: "", kind: "blank", sectionTitle: "Spec" },
      { number: 3, text: "Target line", kind: "normal", sectionTitle: "Spec" },
    ],
    sections: [{ line: 1, level: 1, title: "Spec" }],
  }
  const serverAnnotation = {
    id: "server-note",
    lineStart: 1,
    lineEnd: 1,
    section: "Spec",
    selectedText: "# Spec",
    kind: "issue",
    severity: "major",
    status: "open",
    note: "Server note",
    agentAction: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    anchorState: "ok",
    anchor: { state: "ok", lineStart: 1, lineEnd: 1, sourceText: "# Spec" },
  }
  const reviewAt = (revision: number) => ({
    documentPath: "/tmp/spec.md",
    documentDigest: "abc",
    revision,
    summary: "",
    annotations: [serverAnnotation],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    metrics: { activeMs: 0 },
  })
  let documentCalls = 0
  let saveCalls = 0
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === "/api/config") return json({ defaultDocumentPath: null, waitForReview: false })
    if (url === "/api/reviews") return json([])
    if (url.startsWith("/api/export?")) return json({ markdown: "# Agent Review Feedback" })
    if (url.startsWith("/api/document?")) {
      documentCalls += 1
      return json({ document: documentFixture, review: reviewAt(documentCalls), stale: false, sourceState: "current" })
    }
    if (url === "/api/review" && init?.method === "POST") {
      saveCalls += 1
      const body = JSON.parse(init.body as string)
      if (saveCalls === 1) return json({ error: { code: "review_conflict", message: "Review changed; reload before saving" } }, 409)
      if (saveCalls === 2) return json({ error: { code: "invalid_review", message: "Annotation was rejected" } }, 400)
      expect(body.baseRevision).toBe(3)
      const keys = ["agentAction", "id", "kind", "lineEnd", "lineStart", "note", "severity", "status"]
      expect(body.annotations).toHaveLength(2)
      for (const annotation of body.annotations) expect(Object.keys(annotation).sort()).toEqual(keys)
      return json({ ...reviewAt(4), annotations: body.annotations })
    }
    return json({ error: { code: "not_found", message: "Not found" } }, 404)
  })

  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/?path=/tmp/spec.md"]}><ReviewerPage /></MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  )
  await screen.findByText("Server note")
  fireEvent.click(screen.getByRole("button", { name: "Delete" }))
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Reloaded the saved review"))
  expect(screen.getByText("Server note")).toBeInTheDocument()

  fireEvent.click(screen.getByText("Target line"))
  fireEvent.change(screen.getByRole("textbox", { name: "Feedback" }), { target: { value: "Fresh note" } })
  fireEvent.click(screen.getByRole("button", { name: "Add note" }))
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Annotation was rejected"))
  expect(screen.getByRole("textbox", { name: "Feedback" })).toHaveValue("Fresh note")
  fireEvent.click(screen.getByRole("button", { name: "Clear" }))
  expect(screen.getByRole("spinbutton", { name: "Lines" })).toHaveValue(3)
  fireEvent.change(screen.getByRole("textbox", { name: "Feedback" }), { target: { value: "Fresh note" } })
  fireEvent.click(screen.getByRole("button", { name: "Add note" }))
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved"))
  expect(screen.getByText("Fresh note")).toBeInTheDocument()
  expect(saveCalls).toBe(3)
})
