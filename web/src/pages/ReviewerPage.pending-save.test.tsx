import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { expect, test, vi } from "vitest"
import type { Annotation, Review } from "@/api/types"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ReviewerPage } from "@/pages/ReviewerPage"

const documentFixture = {
  path: "/tmp/spec.md",
  title: "Spec",
  digest: "abc",
  lines: [
    { number: 1, text: "# Spec", kind: "heading" as const, sectionTitle: "Spec" },
    { number: 2, text: "Target line", kind: "normal" as const, sectionTitle: "Spec" },
  ],
  sections: [{ line: 1, level: 1, title: "Spec" }],
}

test("an indeterminate add retry reuses its generated annotation ID", async () => {
  let openCalls = 0
  let saveCalls = 0
  let committed: Annotation | null = null
  let firstId = ""
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === "/api/config") return json({ defaultDocumentPath: null, waitForReview: false })
    if (url === "/api/reviews") return json([])
    if (url.startsWith("/api/export?")) return json({ markdown: "# Agent Review Feedback" })
    if (url.startsWith("/api/document?")) {
      openCalls += 1
      const annotations = committed == null ? [] : [committed]
      return json({ document: documentFixture, review: reviewAt(openCalls - 1, annotations), stale: false, sourceState: "current" })
    }
    if (url === "/api/review" && init?.method === "POST") {
      saveCalls += 1
      const body = JSON.parse(init.body as string) as { annotations: Annotation[] }
      if (saveCalls === 1) {
        committed = body.annotations[0] ?? null
        firstId = committed?.id ?? ""
        return json({ error: { code: "storage_commit_indeterminate", message: "Commit outcome unknown" } }, 500)
      }
      expect(body.annotations).toHaveLength(1)
      expect(body.annotations[0]?.id).toBe(firstId)
      return json(reviewAt(2, body.annotations))
    }
    return json({ error: { code: "not_found", message: "Not found" } }, 404)
  })

  renderPage()
  await addNote("Retry this note")
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Reloaded the saved review"))
  expect(firstId).not.toBe("")
  expect(screen.getByRole("button", { name: "Update note" })).toBeEnabled()

  fireEvent.click(screen.getByRole("button", { name: "Update note" }))
  await waitFor(() => expect(saveCalls).toBe(2))
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved"))
})

test("copy and terminal actions wait for an annotation save", async () => {
  const close = vi.spyOn(window, "close").mockImplementation(() => {})
  let completeSave!: (response: Response) => void
  const pendingSave = new Promise<Response>((resolve) => { completeSave = resolve })
  let completeFinish!: (response: Response) => void
  const pendingFinish = new Promise<Response>((resolve) => { completeFinish = resolve })
  let saveBody: { annotations: Annotation[] } | null = null
  let finishCalls = 0
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === "/api/config") return json({ defaultDocumentPath: documentFixture.path, waitForReview: true })
    if (url === "/api/reviews") return json([])
    if (url.startsWith("/api/export?")) return json({ markdown: "# Agent Review Feedback" })
    if (url.startsWith("/api/document?")) {
      return json({ document: documentFixture, review: reviewAt(0), stale: false, sourceState: "current" })
    }
    if (url === "/api/review" && init?.method === "POST") {
      saveBody = JSON.parse(init.body as string)
      return pendingSave
    }
    if (url === "/api/session/finish" && init?.method === "POST") {
      finishCalls += 1
      return pendingFinish
    }
    return json({ error: { code: "not_found", message: "Not found" } }, 404)
  })

  renderPage()
  await addNote("Pending note")
  await waitFor(() => expect(saveBody).not.toBeNull())

  expect(screen.getByRole("button", { name: "Copy feedback" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "Cancel review" })).toBeDisabled()
  expect(screen.getByRole("button", { name: /Finish review/i })).toBeDisabled()
  expect(finishCalls).toBe(0)

  await act(async () => {
    completeSave(json({ ...reviewAt(1), annotations: saveBody?.annotations ?? [] }))
  })
  await waitFor(() => expect(screen.getByRole("button", { name: /Finish review/i })).toBeEnabled())
  fireEvent.click(screen.getByRole("button", { name: /Finish review/i }))
  await waitFor(() => expect(finishCalls).toBe(1))
  expect(screen.getByRole("button", { name: "Add note" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "Copy feedback" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "Cancel review" })).toBeDisabled()
  expect(screen.getByRole("button", { name: /Finish review/i })).toBeDisabled()
  await act(async () => {
    completeFinish(json({
      status: "finished",
      path: documentFixture.path,
      markdown: "# Agent Review Feedback",
      openAnnotations: 1,
      carriedOver: 0,
      activeMs: 0,
    }))
  })
  expect(await screen.findByText("Review submitted")).toBeInTheDocument()
  close.mockRestore()
})

async function addNote(note: string) {
  fireEvent.click(await screen.findByText("Target line"))
  fireEvent.change(screen.getByRole("textbox", { name: "Feedback" }), { target: { value: note } })
  fireEvent.click(screen.getByRole("button", { name: "Add note" }))
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[`/?path=${documentFixture.path}`]}><ReviewerPage /></MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

function reviewAt(revision: number, annotations: Annotation[] = []): Review {
  return {
    documentPath: documentFixture.path,
    documentDigest: documentFixture.digest,
    revision,
    summary: "",
    annotations,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    metrics: { activeMs: 0 },
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}
