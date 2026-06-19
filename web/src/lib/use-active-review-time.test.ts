import { act, renderHook } from "@testing-library/react"
import { type ReactNode, StrictMode, createElement } from "react"
import { afterEach, expect, test, vi } from "vitest"
import { useActiveReviewTime } from "@/lib/use-active-review-time"

function setVisible(visible: boolean) {
  Object.defineProperty(document, "visibilityState", { value: visible ? "visible" : "hidden", configurable: true })
}
function setFocused(focused: boolean) {
  Object.defineProperty(document, "hasFocus", { value: () => focused, configurable: true })
}

afterEach(() => {
  setVisible(true)
  setFocused(true)
  vi.useRealTimers()
})

test("accumulates while visible and focused", () => {
  vi.useFakeTimers()
  setVisible(true)
  setFocused(true)
  const { result } = renderHook(() => useActiveReviewTime({ path: "/d1" }))
  act(() => { vi.advanceTimersByTime(3000) })
  let delta = -1
  act(() => { delta = result.current.flush() })
  expect(delta).toBeGreaterThanOrEqual(2900)
  expect(delta).toBeLessThanOrEqual(3100)
})

test("pauses when the tab is hidden", () => {
  vi.useFakeTimers()
  setVisible(true)
  setFocused(true)
  const { result } = renderHook(() => useActiveReviewTime({ path: "/d1" }))
  act(() => { vi.advanceTimersByTime(2000) })
  setVisible(false)
  act(() => { document.dispatchEvent(new Event("visibilitychange")) })
  act(() => { vi.advanceTimersByTime(5000) })
  setVisible(true)
  act(() => { document.dispatchEvent(new Event("visibilitychange")) })
  act(() => { vi.advanceTimersByTime(2000) })
  let delta = -1
  act(() => { delta = result.current.flush() })
  expect(delta).toBeGreaterThanOrEqual(3900)
  expect(delta).toBeLessThanOrEqual(4100)
})

test("pauses when the window blurs", () => {
  vi.useFakeTimers()
  setVisible(true)
  setFocused(true)
  const { result } = renderHook(() => useActiveReviewTime({ path: "/d1" }))
  act(() => { vi.advanceTimersByTime(1000) })
  setFocused(false)
  act(() => { window.dispatchEvent(new Event("blur")) })
  act(() => { vi.advanceTimersByTime(5000) })
  setFocused(true)
  act(() => { window.dispatchEvent(new Event("focus")) })
  act(() => { vi.advanceTimersByTime(2000) })
  let delta = -1
  act(() => { delta = result.current.flush() })
  expect(delta).toBeGreaterThanOrEqual(2900)
  expect(delta).toBeLessThanOrEqual(3100)
})

test("does not double-count under StrictMode", () => {
  vi.useFakeTimers()
  setVisible(true)
  setFocused(true)
  const wrapper = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children)
  const { result } = renderHook(() => useActiveReviewTime({ path: "/d1" }), { wrapper })
  act(() => { vi.advanceTimersByTime(3000) })
  let delta = -1
  act(() => { delta = result.current.flush() })
  expect(delta).toBeLessThanOrEqual(3100)
})

test("flush zeroes the accumulator", () => {
  vi.useFakeTimers()
  setVisible(true)
  setFocused(true)
  const { result } = renderHook(() => useActiveReviewTime({ path: "/d1" }))
  act(() => { vi.advanceTimersByTime(1000) })
  act(() => { result.current.flush() })
  let second = -1
  act(() => { second = result.current.flush() })
  expect(second).toBe(0)
})

// P1 regression: an autosave flush must not stop tracking.
test("keeps accumulating after a flush (autosave does not stop the run)", () => {
  vi.useFakeTimers()
  setVisible(true)
  setFocused(true)
  const { result } = renderHook(() => useActiveReviewTime({ path: "/d1" }))
  act(() => { vi.advanceTimersByTime(2000) })
  let first = -1
  act(() => { first = result.current.flush() })
  expect(first).toBeGreaterThan(0)
  act(() => { vi.advanceTimersByTime(2000) })
  let second = -1
  act(() => { second = result.current.flush() })
  expect(second).toBeGreaterThan(0)
})

// P2 regression: on a path change, the prior document's delta is attributed to the prior path.
test("path change attributes the prior delta to the prior path", () => {
  vi.useFakeTimers()
  setVisible(true)
  setFocused(true)
  const flushed: Array<{ delta: number; path: string | null }> = []
  const { rerender } = renderHook(
    ({ path }) => useActiveReviewTime({ path, onAutoFlush: (delta, p) => flushed.push({ delta, path: p }) }),
    { initialProps: { path: "/d1" as string | null } },
  )
  act(() => { vi.advanceTimersByTime(2000) })
  act(() => { rerender({ path: "/d2" }) })
  expect(flushed).toHaveLength(1)
  const prior = flushed[0]
  if (prior == null) throw new Error("expected a flush entry")
  expect(prior.path).toBe("/d1")
  expect(prior.delta).toBeGreaterThan(0)
})

// Regression for the duplicate-content bug: reviews/metrics are stored per PATH, so two documents
// with identical Markdown (same digest) must be tracked as independent runs — switching between them
// flushes and attributes each path's time correctly, with no conflation.
test("each path is tracked independently, even with identical content", () => {
  vi.useFakeTimers()
  setVisible(true)
  setFocused(true)
  const flushed: Array<{ delta: number; path: string | null }> = []
  const { result, rerender } = renderHook(
    ({ path }) => useActiveReviewTime({ path, onAutoFlush: (delta, p) => flushed.push({ delta, path: p }) }),
    { initialProps: { path: "/a" as string | null } },
  )
  act(() => { vi.advanceTimersByTime(2000) }) // 2s on /a
  act(() => { rerender({ path: "/b" }) })      // switch to a different path (same digest in reality)
  expect(flushed.filter((f) => f.path === "/a")).toHaveLength(1)
  expect(flushed[0]!.delta).toBeGreaterThan(0)
  act(() => { vi.advanceTimersByTime(3000) }) // 3s on /b
  let bDelta = -1
  act(() => { bDelta = result.current.flush() })
  expect(bDelta).toBeGreaterThanOrEqual(2900) // only /b's time, not conflated with /a's
})
