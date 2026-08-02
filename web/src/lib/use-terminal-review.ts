import { useRef, useState, type RefObject } from "react"
import { useMutation } from "@tanstack/react-query"
import { api, recordActiveTime } from "@/api/client"
import { routeTerminalActiveTime, sessionOutcomeFor, type SessionOutcome } from "@/lib/terminal-active-time"

interface UseTerminalReviewOptions {
  documentPath: string | null
  sessionPath: string | null
  saveInFlightRef: RefObject<boolean>
  flushActiveTime: () => number
  showStatus: (message: string) => void
}

interface TerminalIntent {
  action: "finish" | "cancel"
  activeMsDelta: number
}

export function useTerminalReview(options: UseTerminalReviewOptions) {
  const inFlightRef = useRef(false)
  const [outcome, setOutcome] = useState<SessionOutcome | null>(null)
  const mutation = useMutation({
    mutationFn: ({ action, activeMsDelta }: TerminalIntent) => {
      if (options.sessionPath == null) throw new Error("No waiting review session")
      return action === "finish"
        ? api.finishReview(options.sessionPath, activeMsDelta)
        : api.cancelReview(options.sessionPath, activeMsDelta)
    },
    onSuccess: (completion) => setOutcome(sessionOutcomeFor(completion)),
    onError: (error) => options.showStatus(error instanceof Error ? error.message : String(error)),
    onSettled: () => {
      inFlightRef.current = false
    },
  })

  function run(action: TerminalIntent["action"]) {
    if (options.saveInFlightRef.current || inFlightRef.current) {
      return options.showStatus("Wait for the pending operation")
    }
    inFlightRef.current = true
    const activeMsDelta = routeTerminalActiveTime(
      options.documentPath,
      options.sessionPath,
      options.flushActiveTime(),
      recordActiveTime,
    )
    mutation.mutate({ action, activeMsDelta })
  }

  return {
    outcome,
    pending: mutation.isPending,
    isInFlight: () => inFlightRef.current,
    finish: () => run("finish"),
    cancel: () => run("cancel"),
  }
}
