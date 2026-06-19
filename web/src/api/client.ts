import type { OpenDocumentResult, RecentReview, Review, ReviewCompletion, ReviewDraft } from "@/api/types"

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body == null ? undefined : { "content-type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  const data = text.trim() === "" ? null : JSON.parse(text)
  if (!response.ok) {
    throw new Error(data?.error?.message ?? response.statusText)
  }
  return data as T
}

export const api = {
  config: () => request<{ defaultDocumentPath: string | null; waitForReview: boolean }>("GET", "/api/config"),
  recentReviews: () => request<RecentReview[]>("GET", "/api/reviews"),
  openDocument: (path: string) => {
    const encoded = encodeURIComponent(path)
    return request<OpenDocumentResult>("GET", `/api/document?path=${encoded}`)
  },
  uploadDocument: (file: { name: string; content: string }) => {
    return request<OpenDocumentResult>("POST", "/api/document-upload", file)
  },
  saveReview: (review: ReviewDraft) => request<Review>("POST", "/api/review", review),
  exportReview: (path: string) => {
    const encoded = encodeURIComponent(path)
    return request<{ markdown: string }>("GET", `/api/export?path=${encoded}`)
  },
  finishReview: (path: string, activeMsDelta = 0) => request<ReviewCompletion>("POST", "/api/session/finish", { path, activeMsDelta }),
  cancelReview: (path: string, activeMsDelta = 0) => request<ReviewCompletion>("POST", "/api/session/cancel", { path, activeMsDelta }),
}

// Fire-and-forget keepalive POST of an active-time delta for the passive flush paths (tab close /
// document switch) where no other request is in flight. keepalive lets it survive page teardown.
export function recordActiveTime(path: string, activeMsDelta: number): void {
  if (activeMsDelta <= 0) return
  void fetch("/api/active-time", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, activeMsDelta }),
    keepalive: true,
  }).catch(() => {})
}
