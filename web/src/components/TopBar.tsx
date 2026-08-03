import { CheckCircle2, Copy, FileCheck2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ReviewSourceState } from "@/api/types"
import { SourceStateBadge } from "@/components/SourceState"
import { ThemeToggle } from "@/components/ThemeToggle"

interface TopBarProps {
  path: string
  sourceState: ReviewSourceState
  canCopy: boolean
  canFinish: boolean
  waitForReview: boolean
  finishing: boolean
  openNotes: number
  onCopy: () => void
  onFinish: () => void
  onCancel: () => void
}

export function TopBar({ path, sourceState, canCopy, canFinish, waitForReview, finishing, openNotes, onCopy, onFinish, onCancel }: TopBarProps) {
  const pathParts = path.split(/[\\/]/).filter(Boolean)
  const fileName = pathParts.at(-1) ?? ""
  const parentName = pathParts.at(-2) ?? ""
  return (
    <header className="sticky top-0 z-40 grid h-10 grid-cols-[auto_minmax(0,1fr)_auto] items-center border-b bg-card px-2">
      <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <FileCheck2 className="size-4 text-primary" />
        <span className="hidden sm:inline">Spec Reviewer</span>
      </div>
      {path ? (
        <h1 className="truncate px-2 text-center text-xs font-medium" title={path} aria-label={`Current document: ${path}`}>
          {parentName ? <span className="text-muted-foreground">{parentName}/</span> : null}{fileName}
        </h1>
      ) : <div aria-hidden="true" />}
      <div className="flex min-w-0 items-center justify-end gap-1">
        <div className="hidden lg:block"><SourceStateBadge state={sourceState} /></div>
        <span className="hidden text-[11px] text-muted-foreground md:inline">{openNotes} open</span>
        <ThemeToggle />
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Copy feedback" title="Handoff and copy feedback" onClick={onCopy} disabled={!canCopy}>
          <Copy />
        </Button>
        {waitForReview ? (
          <>
            <Button type="button" size="icon-sm" variant="ghost" aria-label="Cancel review" title="Cancel review" onClick={onCancel} disabled={finishing}>
              <XCircle />
            </Button>
            <Button type="button" size="sm" aria-label="Finish review" onClick={onFinish} disabled={!canFinish || finishing}>
              <CheckCircle2 /> <span className="hidden sm:inline">Finish</span>
            </Button>
          </>
        ) : null}
      </div>
    </header>
  )
}
