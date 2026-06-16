import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { useTheme } from "./use-theme"

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(event: unknown) => void>()
  const mediaQuery = {
    matches,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_type: string, listener: (event: unknown) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: unknown) => void) =>
      listeners.delete(listener),
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }
  vi.stubGlobal("matchMedia", () => mediaQuery)
  return { mediaQuery, listeners }
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ""
  document.documentElement.style.colorScheme = ""
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test("defaults to system and applies dark when the system prefers dark", () => {
  stubMatchMedia(true)
  const { result } = renderHook(() => useTheme())
  expect(result.current.mode).toBe("system")
  expect(result.current.isDark).toBe(true)
  expect(document.documentElement.classList.contains("dark")).toBe(true)
  expect(document.documentElement.classList.contains("light")).toBe(false)
  expect(document.documentElement.style.colorScheme).toBe("dark")
})

test("system mode applies no override class when the system prefers light", () => {
  stubMatchMedia(false)
  const { result } = renderHook(() => useTheme())
  expect(result.current.isDark).toBe(false)
  expect(document.documentElement.classList.contains("dark")).toBe(false)
  expect(document.documentElement.classList.contains("light")).toBe(false)
})

test("setMode persists the choice and applies the dark class", () => {
  stubMatchMedia(false)
  const { result } = renderHook(() => useTheme())
  act(() => result.current.setMode("dark"))
  expect(result.current.mode).toBe("dark")
  expect(localStorage.getItem("spec-reviewer-theme")).toBe("dark")
  expect(document.documentElement.classList.contains("dark")).toBe(true)
  expect(document.documentElement.classList.contains("light")).toBe(false)
})

test("manual light sets .light so it opts out of the system-dark rule", () => {
  stubMatchMedia(true)
  const { result } = renderHook(() => useTheme())
  act(() => result.current.setMode("light"))
  expect(result.current.mode).toBe("light")
  expect(document.documentElement.classList.contains("light")).toBe(true)
  expect(document.documentElement.classList.contains("dark")).toBe(false)
})

test("a persisted choice beats the system preference on mount", () => {
  localStorage.setItem("spec-reviewer-theme", "light")
  stubMatchMedia(true)
  const { result } = renderHook(() => useTheme())
  expect(result.current.mode).toBe("light")
  expect(document.documentElement.classList.contains("dark")).toBe(false)
  expect(document.documentElement.classList.contains("light")).toBe(true)
})

test("system mode reacts live when the OS preference changes", () => {
  const { mediaQuery, listeners } = stubMatchMedia(false)
  const { result } = renderHook(() => useTheme())
  expect(result.current.isDark).toBe(false)

  Object.defineProperty(mediaQuery, "matches", { value: true, configurable: true })
  act(() => listeners.forEach((listener) => listener({})))

  expect(document.documentElement.classList.contains("dark")).toBe(true)
  expect(document.documentElement.style.colorScheme).toBe("dark")
})
