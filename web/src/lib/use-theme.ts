import { useCallback, useEffect, useState } from "react"

export type ThemeMode = "light" | "dark" | "system"

const STORAGE_KEY = "spec-reviewer-theme"
const MEDIA = "(prefers-color-scheme: dark)"

function readStoredMode(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === "light" || value === "dark" || value === "system") return value
  } catch {
    // localStorage may be unavailable (private mode / sandbox); default below.
  }
  return "system"
}

function prefersDark(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(MEDIA).matches
    : false
}

function isDark(mode: ThemeMode): boolean {
  return mode === "system" ? prefersDark() : mode === "dark"
}

// Applies the resolved theme to <html>. The system default is also handled in
// CSS (theme.css) so there is no flash before this runs; this keeps the .dark
// class in sync so shadcn's `dark:` utilities follow the resolved theme, and
// sets .light so a manual light choice opts out of the system-dark rule.
function applyTheme(mode: ThemeMode): void {
  const dark = isDark(mode)
  const root = document.documentElement
  root.classList.toggle("dark", dark)
  root.classList.toggle("light", mode === "light")
  root.style.colorScheme = dark ? "dark" : "light"
}

export function useTheme(): { mode: ThemeMode; isDark: boolean; setMode: (mode: ThemeMode) => void } {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode())

  useEffect(() => {
    applyTheme(mode)
    if (mode !== "system") return
    const media = window.matchMedia(MEDIA)
    const onChange = () => applyTheme("system")
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Storage may be unavailable; the in-memory mode still drives the UI.
    }
    setModeState(next)
  }, [])

  return { mode, isDark: isDark(mode), setMode }
}
