import type { ReviewCompletion } from "@/api/types"

export type SessionOutcome = { outcome: "finished" | "canceled"; openAnnotations: number; activeMs: number }

export function sessionOutcomeFor(completion: ReviewCompletion): SessionOutcome {
  return completion.status === "finished"
    ? { outcome: "finished", openAnnotations: completion.openAnnotations, activeMs: completion.activeMs }
    : { outcome: "canceled", openAnnotations: 0, activeMs: completion.activeMs }
}

export function routeTerminalActiveTime(
  currentPath: string | null,
  sessionPath: string | null,
  delta: number,
  recordOtherPath: (path: string, delta: number) => void,
): number {
  if (currentPath == null || sessionPath == null || currentPath === sessionPath) return delta
  recordOtherPath(currentPath, delta)
  return 0
}
