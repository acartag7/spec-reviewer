import { AlertTriangle, CheckCircle2, CircleDashed, FileQuestion } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { ReviewSourceState } from "@/api/types"
import { sourceStateLabel } from "@/lib/path-utils"
import { cn } from "@/lib/utils"

interface SourceStateBadgeProps {
  state: ReviewSourceState
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

export function SourceStateBanner({ state }: SourceStateBadgeProps) {
  const message = sourceStateMessage(state)
  if (message == null) return null
  return (
    <div className={cn("rounded-lg border px-3 py-2 text-sm", bannerClass(state))}>
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

function bannerClass(state: ReviewSourceState): string {
  if (state === "changed") return "border-sev-major/30 bg-sev-major/10 text-foreground"
  if (state === "missing") return "border-sev-blocker/30 bg-sev-blocker/10 text-foreground"
  return "border-border bg-muted text-foreground"
}
