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
  const { result } = renderHook(() => useActiveReviewTime({ digest: "d1" }))
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
  const { result } = renderHook(() => useActiveReviewTime({ digest: "d1" }))
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
  const { result } = renderHook(() => useActiveReviewTime({ digest: "d1" }))
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
  const { result } = renderHook(() => useActiveReviewTime({ digest: "d1" }), { wrapper })
  act(() => { vi.advanceTimersByTime(3000) })
  let delta = -1
  act(() => { delta = result.current.flush() })
  expect(delta).toBeLessThanOrEqual(3100)
})

test("flush zeroes the accumulator", () => {
  vi.useFakeTimers()
  setVisible(true)
  setFocused(true)
  const { result } = renderHook(() => useActiveReviewTime({ digest: "d1" }))
  act(() => { vi.advanceTimersByTime(1000) })
  act(() => { result.current.flush() })
  let second = -1
  act(() => { second = result.current.flush() })
  expect(second).toBe(0)
})

test("digest change auto-flushes the prior document's delta", () => {
  vi.useFakeTimers()
  setVisible(true)
  setFocused(true)
  let autoFlushed = 0
  const { rerender } = renderHook(
    ({ digest }) => useActiveReviewTime({ digest, onAutoFlush: (d) => { autoFlushed += d } }),
    { initialProps: { digest: "d1" as string | null } },
  )
  act(() => { vi.advanceTimersByTime(2000) })
  act(() => { rerender({ digest: "d2" }) })
  expect(autoFlushed).toBeGreaterThanOrEqual(1900)
})
