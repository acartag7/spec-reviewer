import type { OpenDocumentResult, RecentReview, Review, ReviewDraft } from "@/api/types"

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
  config: () => request<{ defaultDocumentPath: string | null }>("GET", "/api/config"),
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
}
