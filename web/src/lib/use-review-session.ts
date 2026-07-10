import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { api } from "@/api/client"

export interface SessionOutcome {
  outcome: "finished" | "canceled"
  openAnnotations: number
  carriedOver: number
  activeMs: number
}

export function useReviewSession(path: string | null, onError: (message: string) => void) {
  const [outcome, setOutcome] = useState<SessionOutcome | null>(null)
  const finishMutation = useMutation({
    mutationFn: (activeMsDelta: number) => {
      if (path == null) throw new Error("Open a document first")
      return api.finishReview(path, activeMsDelta)
    },
    onSuccess: (completion) => {
      if (completion.status !== "finished") return
      setOutcome({
        outcome: "finished",
        openAnnotations: completion.openAnnotations,
        carriedOver: completion.carriedOver,
        activeMs: completion.activeMs,
      })
    },
    onError: (error) => onError(error instanceof Error ? error.message : String(error)),
  })
  const cancelMutation = useMutation({
    mutationFn: (activeMsDelta: number) => {
      if (path == null) throw new Error("Open a document first")
      return api.cancelReview(path, activeMsDelta)
    },
    onSuccess: (completion) => {
      if (completion.status === "canceled") {
        setOutcome({ outcome: "canceled", openAnnotations: 0, carriedOver: 0, activeMs: completion.activeMs })
      }
    },
    onError: (error) => onError(error instanceof Error ? error.message : String(error)),
  })
  return {
    outcome,
    finishing: finishMutation.isPending || cancelMutation.isPending,
    finish: (activeMsDelta: number) => finishMutation.mutate(activeMsDelta),
    cancel: (activeMsDelta: number) => cancelMutation.mutate(activeMsDelta),
  }
}
