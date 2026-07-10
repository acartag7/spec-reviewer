import { Check, MapPinCheck, MapPinSearch, MapPinX, Pencil, RotateCcw, Trash2 } from "lucide-react"
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
  onDelete: (annotation: Annotation) => void
  onStatusChange: (annotation: Annotation, status: Annotation["status"]) => void
}

export function AnnotationList({
  annotations,
  saving = false,
  onOpen,
  onEdit,
  onDelete,
  onStatusChange,
}: AnnotationListProps) {
  const open = sortAnnotations(annotations.filter((annotation) => annotation.status === "open"))
  const resolved = sortAnnotations(annotations.filter((annotation) => annotation.status === "resolved"))

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Open notes</div>
        <Badge variant="secondary">{open.length}</Badge>
      </div>
      {open.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-8 text-center">
          <Check className="mx-auto mb-2 size-5 text-ok" />
          <div className="text-sm font-medium">No open feedback</div>
          <div className="mt-1 text-xs text-muted-foreground">Select a passage to add a note.</div>
        </div>
      ) : (
        <div className="grid gap-2">
          {open.map((annotation) => (
            <NoteCard
              key={annotation.id}
              annotation={annotation}
              saving={saving}
              onOpen={onOpen}
              onEdit={onEdit}
              onDelete={onDelete}
              onStatusChange={onStatusChange}
            />
          ))}
        </div>
      )}
      {resolved.length > 0 ? (
        <details className="rounded-xl border bg-muted/20">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium text-muted-foreground">
            <Check className="size-3.5" />
            Resolved
            <Badge variant="outline">{resolved.length}</Badge>
          </summary>
          <div className="grid gap-2 border-t p-3">
            {resolved.map((annotation) => (
              <NoteCard
                key={annotation.id}
                annotation={annotation}
                saving={saving}
                dimmed
                onOpen={onOpen}
                onEdit={onEdit}
                onDelete={onDelete}
                onStatusChange={onStatusChange}
              />
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

function NoteCard({ annotation, saving, dimmed = false, onOpen, onEdit, onDelete, onStatusChange }: NoteCardProps) {
  return (
    <article
      data-severity={annotation.severity}
      className={cn(
        "annotation-card grid cursor-pointer gap-2.5 rounded-xl border bg-background p-3 shadow-xs transition hover:-translate-y-px hover:shadow-sm",
        dimmed && "opacity-70",
      )}
      onClick={() => onOpen(annotation)}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <SeverityBadge severity={annotation.severity} />
        <Badge variant="outline" className="capitalize">{annotation.kind}</Badge>
        <Badge variant="outline" className="font-mono">{rangeLabel(annotation)}</Badge>
        <AnchorStateBadge annotation={annotation} />
      </div>
      <div className="text-sm leading-5">{annotation.note}</div>
      {annotation.agentAction ? (
        <div className="rounded-lg bg-muted px-2.5 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Agent action:</span> {annotation.agentAction}
        </div>
      ) : null}
      <div className="flex flex-wrap justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={saving}
          onClick={(event) => {
            event.stopPropagation()
            onStatusChange(annotation, annotation.status === "open" ? "resolved" : "open")
          }}
        >
          {annotation.status === "open" ? <Check /> : <RotateCcw />}
          {annotation.status === "open" ? "Resolve" : "Reopen"}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={(event) => {
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
  if (state == null) return null
  const Icon = state === "ok" ? MapPinCheck : state === "moved" ? MapPinSearch : MapPinX
  const range = state === "moved" ? annotationAnchorRange(annotation) : null
  const label = range != null ? `moved to ${range}` : anchorStateLabel(state)
  return (
    <Badge variant="outline" className={cn("capitalize", anchorStateClass(state))}>
      <Icon /> {label}
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
