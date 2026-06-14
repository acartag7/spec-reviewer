import { Copy, FileText } from "lucide-react"
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

interface TopBarProps {
  path: string
  sourceState: ReviewSourceState
  canCopy: boolean
  onCopy: () => void
}

export function TopBar({ path, sourceState, canCopy, onCopy }: TopBarProps) {
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
      <Button type="button" size="sm" onClick={onCopy} disabled={!canCopy}>
        <Copy />
        Copy feedback
      </Button>
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
