import { Check, MapPinSearch, MapPinX, Pencil, RotateCcw, Trash2 } from "lucide-react"
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
  saving?: boolean
  onOpen: (annotation: Annotation) => void
  onEdit: (annotation: Annotation) => void
  onStatus: (annotation: Annotation, status: Annotation["status"]) => void
  onDelete: (annotation: Annotation) => void
}

export function AnnotationList({ annotations, saving = false, onOpen, onEdit, onStatus, onDelete }: AnnotationListProps) {
  const open = sortAnnotations(annotations.filter((annotation) => annotation.status === "open"))
  const resolved = sortAnnotations(annotations.filter((annotation) => annotation.status === "resolved"))

  return (
    <section aria-labelledby="annotation-list-heading" className="grid gap-3">
      <div className="flex items-center justify-between">
        <h3 id="annotation-list-heading" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Open notes</h3>
        <span className="text-[11px] text-muted-foreground">{open.length}</span>
      </div>
      {open.length === 0 ? (
        <div className="border border-dashed px-4 py-6 text-center">
          <Check className="mx-auto mb-2 size-4 text-ok" />
          <div className="text-xs font-medium">No open feedback</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Select a passage to add a note.</div>
        </div>
      ) : (
        <div className="grid gap-2">
          {open.map((annotation) => (
            <NoteCard key={annotation.id} annotation={annotation} saving={saving} onOpen={onOpen} onEdit={onEdit} onStatus={onStatus} onDelete={onDelete} />
          ))}
        </div>
      )}
      {resolved.length > 0 ? (
        <details className="border-t">
          <summary className="flex cursor-pointer list-none items-center gap-2 py-2.5 text-[11px] font-medium text-muted-foreground">
            <Check className="size-3.5" /> Resolved <span>{resolved.length}</span>
          </summary>
          <div className="grid gap-2 pt-1">
            {resolved.map((annotation) => (
              <NoteCard key={annotation.id} annotation={annotation} saving={saving} dimmed onOpen={onOpen} onEdit={onEdit} onStatus={onStatus} onDelete={onDelete} />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  )
}

interface NoteCardProps extends Omit<AnnotationListProps, "annotations"> {
  annotation: Annotation
  dimmed?: boolean
}

function NoteCard({ annotation, saving, dimmed = false, onOpen, onEdit, onStatus, onDelete }: NoteCardProps) {
  const resolved = annotation.status === "resolved"
  return (
    <article
      data-severity={annotation.severity}
      className={cn(
        "annotation-card group grid cursor-pointer gap-2 border border-transparent bg-background/75 py-2.5 pl-3 pr-2.5 transition hover:border-border hover:bg-background",
        dimmed && "opacity-70",
      )}
      onClick={() => onOpen(annotation)}
    >
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
        <SeverityLabel severity={annotation.severity} />
        <span className="capitalize">{annotation.kind}</span>
        <span aria-hidden="true">·</span>
        <button type="button" className="rounded-sm px-0.5 font-mono hover:bg-accent hover:text-foreground" onClick={(event) => {
          event.stopPropagation()
          onOpen(annotation)
        }}>
          {rangeLabel(annotation)}
        </button>
        <AnchorStateBadge annotation={annotation} />
      </div>
      <div className="text-xs leading-5">{annotation.note}</div>
      {annotation.agentAction ? (
        <div className="border-l border-border pl-2 text-[11px] leading-4 text-muted-foreground">
          <span className="font-medium text-foreground">Agent action:</span> {annotation.agentAction}
        </div>
      ) : null}
      <div className="flex flex-wrap justify-end gap-0.5 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={(event) => {
          event.stopPropagation()
          onStatus(annotation, resolved ? "open" : "resolved")
        }}>
          {resolved ? <RotateCcw /> : <Check />} {resolved ? "Reopen" : "Resolve"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={(event) => {
          event.stopPropagation()
          onEdit(annotation)
        }}>
          <Pencil /> Edit
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={saving} className="text-destructive hover:text-destructive" onClick={(event) => {
          event.stopPropagation()
          onDelete(annotation)
        }}>
          <Trash2 /> Delete
        </Button>
      </div>
    </article>
  )
}

function AnchorStateBadge({ annotation }: { annotation: Annotation }) {
  const state = annotationAnchorState(annotation)
  if (state == null || state === "ok") return null
  const Icon = state === "moved" ? MapPinSearch : MapPinX
  const range = state === "moved" ? annotationAnchorRange(annotation) : null
  const label = range != null ? `moved to ${range}` : anchorStateLabel(state)
  return (
    <Badge variant="outline" className={cn("h-5 gap-1 px-1.5 text-[10px] capitalize", anchorStateClass(state))}>
      <Icon /> {label}
    </Badge>
  )
}

function anchorStateClass(state: NonNullable<ReturnType<typeof annotationAnchorState>>): string {
  if (state === "moved") return "border-sev-major/35 bg-sev-major/10 text-sev-major"
  return "border-sev-blocker/35 bg-sev-blocker/10 text-sev-blocker"
}

function SeverityLabel({ severity }: { severity: Annotation["severity"] }) {
  return (
    <span className={cn("inline-flex items-center gap-1 capitalize", severityClass(severity))}>
      <span className="size-1.5 rounded-full bg-current" /> {severity}
    </span>
  )
}

function severityClass(severity: Annotation["severity"]): string {
  if (severity === "blocker") return "text-sev-blocker"
  if (severity === "major") return "text-sev-major"
  return "text-muted-foreground"
}
