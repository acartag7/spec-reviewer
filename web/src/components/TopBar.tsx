import { CheckCircle2, Copy, FileCheck2, XCircle } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { ReviewSourceState } from "@/api/types"
import { pathCrumbs } from "@/lib/path-utils"
import { SourceStateBadge } from "@/components/SourceState"
import { ThemeToggle } from "@/components/ThemeToggle"

interface TopBarProps {
  path: string
  sourceState: ReviewSourceState
  canCopy: boolean
  waitForReview: boolean
  finishing: boolean
  saving: boolean
  openNotes: number
  onCopy: () => void
  onFinish: () => void
  onCancel: () => void
}

export function TopBar({ path, sourceState, canCopy, waitForReview, finishing, saving, openNotes, onCopy, onFinish, onCancel }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 flex min-h-16 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur sm:px-4">
      <div className="flex min-w-fit items-center gap-2.5 font-heading text-sm font-semibold">
        <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <FileCheck2 className="size-4" />
        </span>
        <span className="hidden sm:inline">Spec Reviewer</span>
      </div>
      <div className="min-w-0 flex-1">
        <PathBreadcrumb path={path} />
      </div>
      <div className="hidden sm:block"><SourceStateBadge state={sourceState} /></div>
      <Badge variant="secondary" className="hidden md:inline-flex">{openNotes} open</Badge>
      <ThemeToggle />
      <Button type="button" size="sm" variant="outline" aria-label="Copy feedback" onClick={onCopy} disabled={!canCopy || saving || finishing}>
        <Copy />
        <span className="hidden sm:inline">Copy feedback</span>
      </Button>
      {waitForReview ? (
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" aria-label="Cancel review" onClick={onCancel} disabled={finishing || saving}>
            <XCircle />
            <span className="hidden md:inline">Cancel</span>
          </Button>
          <Button type="button" size="sm" aria-label="Finish review" onClick={onFinish} disabled={!canCopy || finishing || saving}>
            <CheckCircle2 />
            <span className="hidden md:inline">Finish review</span>
          </Button>
        </div>
      ) : null}
    </header>
  )
}

function PathBreadcrumb({ path }: { path: string }) {
  const crumbs = pathCrumbs(path)
  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap overflow-hidden font-mono text-xs">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1
          return (
            <FragmentedCrumb
              key={`${crumb}-${index}`}
              crumb={crumb}
              isLast={isLast}
              showSeparator={index < crumbs.length - 1}
            />
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function FragmentedCrumb({
  crumb,
  isLast,
  showSeparator,
}: {
  crumb: string
  isLast: boolean
  showSeparator: boolean
}) {
  return (
    <>
      <BreadcrumbItem className="min-w-0">
        {crumb === "..." ? (
          <BreadcrumbEllipsis />
        ) : isLast ? (
          <BreadcrumbPage className="truncate">{crumb}</BreadcrumbPage>
        ) : (
          <span className="truncate text-muted-foreground">{crumb}</span>
        )}
      </BreadcrumbItem>
      {showSeparator && <BreadcrumbSeparator />}
    </>
  )
}
