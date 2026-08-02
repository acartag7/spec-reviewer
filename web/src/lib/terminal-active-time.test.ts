import { expect, test, vi } from "vitest"
import { routeTerminalActiveTime, sessionOutcomeFor } from "@/lib/terminal-active-time"

test("terminal outcome follows the shared server result, not the clicked button", () => {
  expect(sessionOutcomeFor({
    status: "finished",
    path: "/tmp/spec.md",
    markdown: "done",
    openAnnotations: 2,
    carriedOver: 0,
    activeMs: 10,
  })).toEqual({ outcome: "finished", openAnnotations: 2, activeMs: 10 })
  expect(sessionOutcomeFor({
    status: "canceled",
    path: "/tmp/spec.md",
    reason: null,
    activeMs: 20,
  })).toEqual({ outcome: "canceled", openAnnotations: 0, activeMs: 20 })
})

test("terminal active time stays with the document where it accrued", () => {
  const record = vi.fn()
  expect(routeTerminalActiveTime("/tmp/other.md", "/tmp/session.md", 100, record)).toBe(0)
  expect(record).toHaveBeenCalledWith("/tmp/other.md", 100)
  expect(routeTerminalActiveTime("/tmp/session.md", "/tmp/session.md", 200, record)).toBe(200)
})
