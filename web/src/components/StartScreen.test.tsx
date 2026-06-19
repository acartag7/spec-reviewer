import { render, screen } from "@testing-library/react"
import { expect, test } from "vitest"
import { StartScreen } from "@/components/StartScreen"
import type { RecentReview } from "@/api/types"

const review: RecentReview = {
  id: "abc123",
  documentPath: "/tmp/spec.md",
  title: "spec.md",
  documentDigest: "d",
  annotations: 3,
  openAnnotations: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
  activeMs: 3600000,
  sourceState: "current",
  currentDigest: "d",
}

test("recent reviews show the accumulated active time per document", () => {
  render(
    <StartScreen
      defaultPath=""
      reviews={[review]}
      loadingReviews={false}
      onOpenPath={() => {}}
      onOpenFile={() => {}}
    />,
  )
  expect(screen.getByText("spec.md")).toBeInTheDocument()
  expect(screen.getByText(/1h 00m/)).toBeInTheDocument()
})

test("a review with no active time omits the duration label", () => {
  render(
    <StartScreen
      defaultPath=""
      reviews={[{ ...review, activeMs: 0 }]}
      loadingReviews={false}
      onOpenPath={() => {}}
      onOpenFile={() => {}}
    />,
  )
  expect(screen.queryByText(/\ds|\dm/)).not.toBeInTheDocument()
})
