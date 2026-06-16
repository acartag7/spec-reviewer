import { CheckCircle2, Copy, FileText, XCircle } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
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
  onCopy: () => void
  onFinish: () => void
  onCancel: () => void
}

export function TopBar({ path, sourceState, canCopy, waitForReview, finishing, onCopy, onFinish, onCancel }: TopBarProps) {
  return (
    <header className="flex min-h-14 items-center gap-3 border-b bg-background px-4">
      <div className="flex min-w-fit items-center gap-2 font-heading text-sm font-semibold">
        <FileText className="size-4" />
        Spec Reviewer
      </div>
      <div className="min-w-0 flex-1">
        <PathBreadcrumb path={path} />
      </div>
      <SourceStateBadge state={sourceState} />
      <ThemeToggle />
      <Button type="button" size="sm" onClick={onCopy} disabled={!canCopy}>
        <Copy />
        Copy feedback
      </Button>
      {waitForReview ? (
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={finishing}>
            <XCircle />
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={onFinish} disabled={!canCopy || finishing}>
            <CheckCircle2 />
            Finish review
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
