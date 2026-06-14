import { MapPinCheck, MapPinSearch, MapPinX, Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Annotation } from "@/api/types"
import {
  annotationAnchorRange,
  annotationAnchorState,
  anchorStateLabel,
  rangeLabel,
  sortAnnotations,
} from "@/lib/review-utils"
import { cn } from "@/lib/utils"

interface AnnotationListProps {
  annotations: Annotation[]
  onOpen: (annotation: Annotation) => void
  onEdit: (annotation: Annotation) => void
  onDelete: (annotation: Annotation) => void
}

export function AnnotationList({ annotations, onOpen, onEdit, onDelete }: AnnotationListProps) {
  const sorted = sortAnnotations(annotations)
  return (
    <section className="grid gap-3">
      <div className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">Open Notes</div>
      {sorted.length === 0 ? (
        <div className="text-sm text-muted-foreground">No annotations yet.</div>
      ) : (
        <div className="grid gap-2">
          {sorted.map((annotation) => (
            <article
              key={annotation.id}
              className="grid cursor-pointer gap-2 rounded-lg border bg-muted/40 p-3 hover:bg-muted"
              onClick={() => onOpen(annotation)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={annotation.severity} />
                <Badge variant="outline">{annotation.kind}</Badge>
                <Badge variant="outline">{rangeLabel(annotation)}</Badge>
                <AnchorStateBadge annotation={annotation} />
              </div>
              <div className="text-sm leading-5">{annotation.note}</div>
              <div className="flex justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation()
                    onEdit(annotation)
                  }}
                >
                  <Pencil />
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDelete(annotation)
                  }}
                >
                  <Trash2 />
                  Delete
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function AnchorStateBadge({ annotation }: { annotation: Annotation }) {
  const state = annotationAnchorState(annotation)
  if (state == null) return null
  const Icon = state === "ok" ? MapPinCheck : state === "moved" ? MapPinSearch : MapPinX
  const range = state === "moved" ? annotationAnchorRange(annotation) : null
  const label = range != null ? `moved to ${range}` : anchorStateLabel(state)

  return (
    <Badge variant="outline" className={cn("capitalize", anchorStateClass(state))}>
      <Icon />
      {label}
    </Badge>
  )
}

function anchorStateClass(state: NonNullable<ReturnType<typeof annotationAnchorState>>): string {
  if (state === "ok") return "border-ok/30 bg-ok/10 text-ok"
  if (state === "moved") return "border-sev-major/35 bg-sev-major/10 text-sev-major"
  return "border-sev-blocker/35 bg-sev-blocker/10 text-sev-blocker"
}

function SeverityBadge({ severity }: { severity: Annotation["severity"] }) {
  return (
    <Badge variant="outline" className={cn("capitalize", severityClass(severity))}>
      {severity}
    </Badge>
  )
}

function severityClass(severity: Annotation["severity"]): string {
  if (severity === "blocker") return "border-sev-blocker/40 text-sev-blocker"
  if (severity === "major") return "border-sev-major/40 text-sev-major"
  return "text-muted-foreground"
}
