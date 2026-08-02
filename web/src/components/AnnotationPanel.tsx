import { RotateCcw, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { AnnotationKind, AnnotationSeverity, AnnotationStatus, SelectionRange } from "@/api/types"
import { kinds, severities, statuses, type AnnotationFormValue } from "@/lib/review-utils"
import { cn } from "@/lib/utils"

interface AnnotationPanelProps {
  form: AnnotationFormValue
  selection: SelectionRange
  saving: boolean
  onChange: (form: AnnotationFormValue) => void
  onSubmit: () => void
  onReset: () => void
}

export function AnnotationPanel({
  form,
  selection,
  saving,
  onChange,
  onSubmit,
  onReset,
}: AnnotationPanelProps) {
  return (
    <section className="grid gap-3">
      <div className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">Annotation</div>
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <Label className="grid gap-1 text-xs text-muted-foreground">
            Lines
            <Input
              name="lineStart"
              type="number"
              min={1}
              value={form.lineStart}
              onChange={(event) => onChange({ ...form, lineStart: positiveInput(event.currentTarget.value) })}
            />
          </Label>
          <Label className="grid gap-1 text-xs text-muted-foreground">
            To
            <Input
              name="lineEnd"
              type="number"
              min={1}
              value={form.lineEnd}
              onChange={(event) => onChange({ ...form, lineEnd: positiveInput(event.currentTarget.value) })}
            />
          </Label>
        </div>
        <SegmentedField
          label="Severity"
          value={form.severity}
          options={severities}
          onChange={(severity) => onChange({ ...form, severity })}
        />
        <SegmentedField
          label="Kind"
          value={form.kind}
          options={kinds}
          onChange={(kind) => onChange({ ...form, kind })}
        />
        <SegmentedField
          label="Status"
          value={form.status}
          options={statuses}
          onChange={(status) => onChange({ ...form, status })}
        />
        <Label className="grid gap-1 text-xs text-muted-foreground">
          Selected source text
          <Textarea
            name="selectedText"
            rows={2}
            value={form.selectedText}
            readOnly
            className="max-h-44 min-h-16 font-mono text-xs"
          />
        </Label>
        <Label className="grid gap-1 text-xs text-muted-foreground">
          Feedback
          <Textarea
            name="note"
            rows={5}
            required
            value={form.note}
            onChange={(event) => onChange({ ...form, note: event.currentTarget.value })}
          />
        </Label>
        <Label className="grid gap-1 text-xs text-muted-foreground">
          Agent action
          <Textarea
            name="agentAction"
            rows={3}
            value={form.agentAction}
            onChange={(event) => onChange({ ...form, agentAction: event.currentTarget.value })}
          />
        </Label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onReset}>
            <RotateCcw />
            Clear
          </Button>
          <Button type="submit" disabled={saving}>
            <Save />
            {form.id ? "Update note" : "Add note"}
          </Button>
        </div>
        <input name="selectionLineStart" type="hidden" value={selection.lineStart} readOnly />
      </form>
    </section>
  )
}

function SegmentedField<T extends AnnotationSeverity | AnnotationKind | AnnotationStatus>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="grid gap-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-[3px]">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            className={cn(
              "h-7 min-w-16 rounded-md px-2 text-sm font-medium text-muted-foreground",
              option.value === value && "bg-background text-foreground shadow-sm",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function positiveInput(value: string): number {
  const next = Number(value)
  return Number.isInteger(next) && next > 0 ? next : 1
}
