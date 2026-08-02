import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { expect, test, vi } from "vitest"
import type { Annotation, Review } from "@/api/types"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ReviewerPage } from "@/pages/ReviewerPage"

test("a newer summary draft survives its pending save and remains terminal-gated", async () => {
  let completeFirstSave!: (response: Response) => void
  const pendingFirstSave = new Promise<Response>((resolve) => { completeFirstSave = resolve })
  const saveBodies: Array<{ baseRevision: number; summary: string; annotations: Annotation[] }> = []
  stubReviewApi(async (url, init) => {
    if (url === "/api/config") return json({ defaultDocumentPath: documentFixture.path, waitForReview: true })
    if (url === "/api/review" && init?.method === "POST") {
      const body = JSON.parse(init.body as string)
      saveBodies.push(body)
      return saveBodies.length === 1 ? pendingFirstSave : json({ ...reviewAt(2, body.annotations), summary: body.summary })
    }
  })

  renderPage()
  fireEvent.click(await screen.findByRole("tab", { name: /Notes/ }))
  const summary = screen.getByRole("textbox", { name: "Overall assessment" })
  fireEvent.change(summary, { target: { value: "First summary" } })
  expect(screen.getByText("Unsaved draft")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Copy feedback" }))
  expect(screen.getByRole("status")).toHaveTextContent("Save or clear your draft before copying feedback")
  fireEvent.click(screen.getByRole("button", { name: /Finish review/i }))
  expect(screen.getByRole("status")).toHaveTextContent("Save or clear your draft before finishing")
  fireEvent.click(screen.getByRole("button", { name: "Save summary" }))
  await waitFor(() => expect(saveBodies).toHaveLength(1))
  expect(saveBodies[0]).toMatchObject({ baseRevision: 0, summary: "First summary", annotations: [] })

  fireEvent.change(summary, { target: { value: "Newer summary" } })
  await act(async () => completeFirstSave(json({ ...reviewAt(1), summary: "First summary" })))
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved"))
  expect(summary).toHaveValue("Newer summary")
  fireEvent.click(screen.getByRole("button", { name: "Save summary" }))
  await waitFor(() => expect(saveBodies).toHaveLength(2))
  expect(saveBodies[1]).toMatchObject({ baseRevision: 1, summary: "Newer summary", annotations: [] })
  await waitFor(() => expect(screen.getByRole("button", { name: "Save summary" })).toBeDisabled())
  expect(screen.getByText("Saved locally")).toBeInTheDocument()
})

test("saving an annotation does not silently commit the summary draft", async () => {
  const storedReview = { ...reviewAt(0), summary: "Saved summary" }
  const saveBodies: Array<{ summary: string; annotations: Annotation[] }> = []
  stubReviewApi(async (url, init) => {
    if (url.startsWith("/api/document?")) return json({ document: documentFixture, review: storedReview, stale: false, sourceState: "current" })
    if (url === "/api/review" && init?.method === "POST") {
      const body = JSON.parse(init.body as string)
      saveBodies.push(body)
      return json({ ...reviewAt(1, body.annotations), summary: "Saved summary" })
    }
  })

  renderPage()
  fireEvent.click(await screen.findByRole("tab", { name: /Notes/ }))
  const summary = screen.getByRole("textbox", { name: "Overall assessment" })
  fireEvent.change(summary, { target: { value: "Half-written summary" } })
  fireEvent.click(screen.getByRole("tab", { name: "Feedback" }))
  await addNote("Save only this note")
  await waitFor(() => expect(saveBodies).toHaveLength(1))
  expect(saveBodies[0]?.summary).toBe("Saved summary")
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved"))
  fireEvent.click(screen.getByRole("tab", { name: /Notes/ }))
  expect(summary).toHaveValue("Half-written summary")
  expect(screen.getByText("Unsaved changes")).toBeInTheDocument()
})

test("conflict recovery adopts a remotely saved summary when the local draft was untouched", async () => {
  let openCalls = 0
  const saveBodies: Array<{ baseRevision: number; summary: string; annotations: Annotation[] }> = []
  stubReviewApi(async (url, init) => {
    if (url.startsWith("/api/document?")) {
      openCalls += 1
      const reloaded = { ...reviewAt(openCalls - 1), summary: openCalls === 1 ? "Old summary" : "Summary from tab A" }
      return json({ document: documentFixture, review: reloaded, stale: false, sourceState: "current" })
    }
    if (url === "/api/review" && init?.method === "POST") {
      const body = JSON.parse(init.body as string)
      saveBodies.push(body)
      return saveBodies.length === 1
        ? json({ error: { code: "review_conflict", message: "Review changed; reload before saving" } }, 409)
        : json({ ...reviewAt(2, body.annotations), summary: body.summary })
    }
  })

  renderPage()
  await addNote("Retry after conflict")
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Reloaded the saved review"))
  fireEvent.click(screen.getByRole("tab", { name: /Notes/ }))
  expect(screen.getByRole("textbox", { name: "Overall assessment" })).toHaveValue("Summary from tab A")
  fireEvent.click(screen.getByRole("tab", { name: "Feedback" }))
  fireEvent.click(screen.getByRole("button", { name: "Update note" }))
  await waitFor(() => expect(saveBodies).toHaveLength(2))
  expect(saveBodies[1]).toMatchObject({ baseRevision: 1, summary: "Summary from tab A" })
})

function stubReviewApi(handler: (url: string, init?: RequestInit) => Promise<Response | undefined>) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const response = await handler(url, init)
    if (response != null) return response
    if (url === "/api/config") return json({ defaultDocumentPath: null, waitForReview: false })
    if (url === "/api/reviews") return json([])
    if (url.startsWith("/api/export?")) return json({ markdown: "# Agent Review Feedback" })
    if (url.startsWith("/api/document?")) return json({ document: documentFixture, review: reviewAt(0), stale: false, sourceState: "current" })
    return json({ error: { code: "not_found", message: "Not found" } }, 404)
  })
}

async function addNote(note: string) {
  fireEvent.click(await screen.findByText("Target line"))
  fireEvent.change(screen.getByRole("textbox", { name: "Feedback" }), { target: { value: note } })
  fireEvent.click(screen.getByRole("button", { name: "Add note" }))
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><TooltipProvider><MemoryRouter initialEntries={[`/?path=${documentFixture.path}`]}><ReviewerPage /></MemoryRouter></TooltipProvider></QueryClientProvider>)
}

const documentFixture = {
  path: "/tmp/spec.md", title: "Spec", digest: "abc",
  lines: [{ number: 1, text: "# Spec", kind: "heading" as const, sectionTitle: "Spec" }, { number: 2, text: "Target line", kind: "normal" as const, sectionTitle: "Spec" }],
  sections: [{ line: 1, level: 1, title: "Spec" }],
}

function reviewAt(revision: number, annotations: Annotation[] = []): Review {
  return { documentPath: documentFixture.path, documentDigest: documentFixture.digest, revision, summary: "", annotations, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", metrics: { activeMs: 0 } }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}
