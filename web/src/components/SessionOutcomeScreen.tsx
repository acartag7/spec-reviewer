import { useEffect } from "react"
import { CheckCircle2, XCircle } from "lucide-react"
import { formatActiveDuration } from "@/lib/utils"

interface SessionOutcomeScreenProps {
  outcome: "finished" | "canceled"
  openAnnotations?: number
  carriedOver?: number
  activeMs?: number
}

/**
 * Terminal screen shown after Finish/Cancel in a `--wait` agent-handoff session.
 *
 * The CLI resolves the waiter, prints the JSON, and tears the server down the
 * moment this outcome is reached, so the page cannot keep interacting with the
 * API. We render a clear end-state and attempt to close the tab; browsers only
 * honor `window.close()` for script-opened windows, so when that is blocked the
 * message tells the user they can close it themselves.
 */
export function SessionOutcomeScreen({ outcome, openAnnotations, carriedOver, activeMs }: SessionOutcomeScreenProps) {
  useEffect(() => {
    try {
      window.close()
    } catch {
      // window.close() is a no-op for non-script-opened tabs; the message covers that case.
    }
  }, [])

  const finished = outcome === "finished"
  const Icon = finished ? CheckCircle2 : XCircle
  const title = finished ? "Review submitted" : "Review canceled"
  const body = finished
    ? "Feedback sent to the agent. You can close this window."
    : "No feedback was sent. You can close this window."

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border bg-card p-8 text-center shadow-sm">
        <Icon className={`size-10 ${finished ? "text-emerald-500" : "text-muted-foreground"}`} />
        <h1 className="font-heading text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
        {finished && (openAnnotations != null || carriedOver != null || activeMs != null) ? (
          <p className="font-mono text-xs text-muted-foreground">
            {openAnnotations ?? 0} live · {carriedOver ?? 0} carried over · {formatActiveDuration(activeMs ?? 0)} reviewing
          </p>
        ) : null}
      </div>
    </div>
  )
}
