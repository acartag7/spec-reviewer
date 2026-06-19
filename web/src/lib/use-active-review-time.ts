import { useCallback, useEffect, useRef } from "react"

const ACCUMULATE_INTERVAL_MS = 1000

interface UseActiveReviewTimeOptions {
  digest: string | null
  path: string | null
  /** Called with the captured delta and the path it was accumulated under, on digest change and
   *  beforeunload (the passive exit paths). The path is the one armed when the delta accrued, so a
   *  document switch attributes the prior delta to the prior document — not the newly opened one. */
  onAutoFlush?: (delta: number, path: string | null) => void
}

// Measures "active reviewing time": accumulates milliseconds while the document tab is VISIBLE and
// the window is FOCUSED, and pauses on hide/blur. Silent reading counts — there is no input-idle
// cutoff. (A future idle cutoff would gate the `isActive()` check inside the heartbeat.)
//
// The caller owns transport: call flush() to snapshot the accumulated delta (it zeroes the
// accumulator but KEEPS the run alive) and send it on autosave / finish / cancel. onAutoFlush covers
// the passive exits (document switch, tab close), attributing the delta to the path open when it
// accrued. START is idempotent per digest, so React <StrictMode> double-invocation does not double-count.
export function useActiveReviewTime({ digest, path, onAutoFlush }: UseActiveReviewTimeOptions): { flush: () => number } {
  const accumulatedRef = useRef(0)
  const runStartRef = useRef<number | null>(null)
  const armedRef = useRef(false)
  const startDigestRef = useRef<string | null>(null)
  const armedPathRef = useRef<string | null>(null)
  const onAutoFlushRef = useRef(onAutoFlush)
  onAutoFlushRef.current = onAutoFlush

  const isActive = useCallback(
    () => armedRef.current
      && typeof document !== "undefined"
      && document.visibilityState === "visible"
      && document.hasFocus(),
    [],
  )

  // Fold the in-flight active run into the accumulator. keepRunning=true restarts the run (used by
  // the heartbeat and by flush, so a save does NOT end the active period); keepRunning=false pauses
  // it (visibility/focus loss). Drift-correcting: it uses real elapsed, not a fixed tick.
  const fold = useCallback((keepRunning: boolean) => {
    if (runStartRef.current == null) return
    const now = performance.now()
    accumulatedRef.current += Math.max(0, now - runStartRef.current)
    runStartRef.current = keepRunning ? now : null
  }, [])

  const startRun = useCallback(() => {
    if (armedRef.current && runStartRef.current == null) runStartRef.current = performance.now()
  }, [])

  const stopRun = useCallback(() => fold(false), [fold])

  // flush snapshots the accumulated delta and zeroes it but keeps the run alive (fold(true)), so a
  // save mid-review does not stop tracking — otherwise all active time after an autosave would be
  // dropped until the next focus/visibility event.
  const flush = useCallback((): number => {
    fold(true)
    const delta = accumulatedRef.current
    accumulatedRef.current = 0
    return delta
  }, [fold])

  const autoFlush = useCallback(() => {
    const delta = flush()
    if (delta > 0) onAutoFlushRef.current?.(delta, armedPathRef.current)
  }, [flush])

  // Heartbeat: fold the active run each second so a tab closed mid-run loses at most ~1s. If we are
  // active but the run is stopped, restart it — defense so an active tab never silently stops counting.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!isActive()) return
      if (runStartRef.current == null) startRun()
      fold(true)
    }, ACCUMULATE_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [isActive, fold, startRun])

  // React to focus/visibility changes immediately rather than waiting for the next heartbeat.
  useEffect(() => {
    const onVisibility = () => (document.visibilityState === "visible" ? startRun() : stopRun())
    const onFocus = () => startRun()
    const onBlur = () => stopRun()
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("focus", onFocus)
    window.addEventListener("blur", onBlur)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("focus", onFocus)
      window.removeEventListener("blur", onBlur)
    }
  }, [startRun, stopRun])

  // Arm/disarm per digest (idempotent under StrictMode via startDigestRef). Switching documents
  // auto-flushes the prior document's delta, attributed via armedPathRef — which still holds the
  // prior path at flush time and is only updated to the new path afterwards.
  useEffect(() => {
    if (digest == null) {
      if (startDigestRef.current != null) autoFlush()
      armedRef.current = false
      runStartRef.current = null
      startDigestRef.current = null
      armedPathRef.current = null
      return
    }
    if (startDigestRef.current === digest) return
    if (startDigestRef.current != null) autoFlush()
    startDigestRef.current = digest
    armedPathRef.current = path
    armedRef.current = true
    if (isActive()) startRun()
  }, [digest, path, autoFlush, isActive, startRun])

  // Tab close without finish: best-effort flush through the caller's onAutoFlush (keepalive fetch).
  useEffect(() => {
    const onBeforeUnload = () => autoFlush()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [autoFlush])

  return { flush }
}
