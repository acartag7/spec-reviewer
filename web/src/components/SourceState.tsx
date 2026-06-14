import { AlertTriangle, CheckCircle2, CircleDashed, FileQuestion } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { Annotation, ReviewSourceState } from "@/api/types"
import { sourceStateLabel } from "@/lib/path-utils"
import { anchorDriftSummary, anchorDriftText } from "@/lib/review-utils"
import { cn } from "@/lib/utils"

interface SourceStateBadgeProps {
  state: ReviewSourceState
}

interface SourceStateBannerProps extends SourceStateBadgeProps {
  annotations?: Annotation[]
}

const chipClass: Record<ReviewSourceState, string> = {
  unreviewed: "border-border bg-secondary text-secondary-foreground",
  current: "border-ok/30 bg-ok/10 text-ok",
  changed: "border-sev-major/35 bg-sev-major/10 text-sev-major",
  missing: "border-sev-blocker/35 bg-sev-blocker/10 text-sev-blocker",
}

export function SourceStateBadge({ state }: SourceStateBadgeProps) {
  const Icon = stateIcon(state)
  return (
    <Badge variant="outline" className={cn("capitalize", chipClass[state])}>
      <Icon />
      {sourceStateLabel(state)}
    </Badge>
  )
}

export function SourceStateBanner({ state, annotations = [] }: SourceStateBannerProps) {
  const drift = anchorDriftSummary(annotations)
  const message = drift.total > 0 ? anchorDriftMessage(drift) : sourceStateMessage(state)
  if (message == null) return null
  return (
    <div
      role={drift.total > 0 ? "alert" : "status"}
      className={cn("rounded-lg border px-3 py-2 text-sm", bannerClass(state, drift.total > 0, drift.notFound > 0))}
    >
      {message}
    </div>
  )
}

function stateIcon(state: ReviewSourceState) {
  if (state === "current") return CheckCircle2
  if (state === "changed") return AlertTriangle
  if (state === "missing") return FileQuestion
  return CircleDashed
}

function sourceStateMessage(state: ReviewSourceState): string | null {
  if (state === "changed") {
    return "This file changed since these notes were saved. Recheck line anchors before sending feedback."
  }
  if (state === "unreviewed") return "No saved review yet. Notes will start tracking this file version."
  if (state === "missing") return "The saved review points at a file that is no longer available."
  return null
}

function anchorDriftMessage(summary: ReturnType<typeof anchorDriftSummary>): string {
  return `Anchor drift detected: ${anchorDriftText(summary)}. Recheck before sending feedback.`
}

function bannerClass(state: ReviewSourceState, hasDrift = false, hasMissingAnchor = false): string {
  if (hasMissingAnchor || state === "missing") return "border-sev-blocker/30 bg-sev-blocker/10 text-foreground"
  if (hasDrift || state === "changed") return "border-sev-major/30 bg-sev-major/10 text-foreground"
  return "border-border bg-muted text-foreground"
}
