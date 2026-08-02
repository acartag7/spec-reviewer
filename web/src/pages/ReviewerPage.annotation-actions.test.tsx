import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { expect, test, vi } from "vitest"
import type { Annotation, Review } from "@/api/types"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ReviewerPage } from "@/pages/ReviewerPage"

test.each([
  ["resolve", "success"],
  ["delete", "success"],
  ["resolve", "reload"],
  ["delete", "reload"],
] as const)("reconciles the open editor after a note %s on %s", async (action, outcome) => {
  let stored = reviewAt(0, [annotation])
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === "/api/config") return json({ defaultDocumentPath: null, waitForReview: false })
    if (url === "/api/reviews") return json([])
    if (url.startsWith("/api/export?")) return json({ markdown: "# Agent Review Feedback" })
    if (url.startsWith("/api/document?")) return json({ document: documentFixture, review: stored, stale: false, sourceState: "current" })
    if (url === "/api/review" && init?.method === "POST") {
      const body = JSON.parse(init.body as string) as { summary: string; annotations: Annotation[] }
      stored = { ...reviewAt(stored.revision + 1, body.annotations), summary: body.summary }
      return outcome === "success" ? json(stored) : json({ error: { code: "storage_commit_indeterminate", message: "Commit outcome unknown" } }, 500)
    }
    return json({ error: { code: "not_found", message: "Not found" } }, 404)
  })

  renderPage()
  fireEvent.click(await screen.findByRole("tab", { name: /Notes/ }))
  fireEvent.click(screen.getByRole("button", { name: "Edit" }))
  fireEvent.click(screen.getByRole("tab", { name: /Notes/ }))
  fireEvent.click(screen.getByRole("button", { name: action === "resolve" ? "Resolve" : "Delete" }))
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(outcome === "success" ? "Saved" : "Reloaded the saved review"))

  fireEvent.click(screen.getByRole("tab", { name: "Feedback" }))
  if (action === "resolve") {
    expect(screen.getByText("Resolved note")).toBeInTheDocument()
  } else {
    expect(screen.getByText("No source selected")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add note" })).toBeDisabled()
  }
  fireEvent.click(screen.getByRole("button", { name: "Copy feedback" }))
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Feedback ready below"))
})

test.each(["success", "reload"] as const)("preserves edits made while a deletion settles on %s", async (outcome) => {
  let stored = reviewAt(0, [annotation])
  let completeSave!: (response: Response) => void
  const pendingSave = new Promise<Response>((resolve) => { completeSave = resolve })
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === "/api/config") return json({ defaultDocumentPath: null, waitForReview: false })
    if (url === "/api/reviews") return json([])
    if (url.startsWith("/api/export?")) return json({ markdown: "# Agent Review Feedback" })
    if (url.startsWith("/api/document?")) return json({ document: documentFixture, review: stored, stale: false, sourceState: "current" })
    if (url === "/api/review" && init?.method === "POST") {
      const body = JSON.parse(init.body as string) as { annotations: Annotation[] }
      stored = reviewAt(1, body.annotations)
      return pendingSave
    }
    return json({ error: { code: "not_found", message: "Not found" } }, 404)
  })

  renderPage()
  fireEvent.click(await screen.findByRole("tab", { name: /Notes/ }))
  fireEvent.click(screen.getByRole("button", { name: "Edit" }))
  fireEvent.click(screen.getByRole("tab", { name: /Notes/ }))
  fireEvent.click(screen.getByRole("button", { name: "Delete" }))
  fireEvent.click(screen.getByRole("tab", { name: "Feedback" }))
  fireEvent.change(screen.getByRole("textbox", { name: "Feedback" }), { target: { value: "Keep this newer draft" } })
  completeSave(outcome === "success" ? json(stored) : json({ error: { code: "storage_commit_indeterminate", message: "Commit outcome unknown" } }, 500))

  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(outcome === "success" ? "Saved" : "Reloaded the saved review"))
  expect(screen.getByRole("textbox", { name: "Feedback" })).toHaveValue("Keep this newer draft")
})

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

const documentFixture = {
  path: "/tmp/spec.md",
  title: "Spec",
  digest: "abc",
  lines: [{ number: 1, text: "# Spec", kind: "heading" as const, sectionTitle: "Spec" }],
  sections: [{ line: 1, level: 1, title: "Spec" }],
}

const annotation: Annotation = {
  id: "note-1",
  lineStart: 1,
  lineEnd: 1,
  section: "Spec",
  selectedText: "# Spec",
  kind: "issue",
  severity: "major",
  status: "open",
  note: "Fix this",
  agentAction: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  anchorState: "ok",
  anchor: { state: "ok", lineStart: 1, lineEnd: 1, sourceText: "# Spec" },
}

function reviewAt(revision: number, annotations: Annotation[]): Review {
  return { documentPath: documentFixture.path, documentDigest: documentFixture.digest, revision, summary: "", annotations, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", metrics: { activeMs: 0 } }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}
