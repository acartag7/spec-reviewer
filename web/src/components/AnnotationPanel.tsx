import { MapPin, RotateCcw, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { AnnotationKind, AnnotationSeverity, SelectionRange } from "@/api/types"
import { emptyForm, kinds, severities, type AnnotationFormValue } from "@/lib/review-utils"
import { cn } from "@/lib/utils"

interface AnnotationPanelProps {
  form: AnnotationFormValue
  selection: SelectionRange
  maxLine: number
  saving: boolean
  onChange: (form: AnnotationFormValue) => void
  onSubmit: () => void
  onReset: () => void
}

export function AnnotationPanel({
  form,
  selection,
  maxLine,
  saving,
  onChange,
  onSubmit,
  onReset,
}: AnnotationPanelProps) {
  return (
    <section className="grid gap-3">
      <div className="flex items-start gap-2 border-b pb-3">
        <MapPin className="mt-0.5 size-3.5 text-muted-foreground" />
        <div>
          <div className="text-xs font-medium">
          {rangeText(form.lineStart, form.lineEnd)}
          </div>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
            Select a passage, then describe what the agent should change.
          </p>
        </div>
      </div>
      {form.status === "resolved" ? (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-accent/60 p-2.5 text-xs">
          <span>Resolved note</span>
          <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...form, status: "open" })}>
            <RotateCcw /> Reopen for agent
          </Button>
        </div>
      ) : null}
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <details className="group">
          <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">Adjust source range</summary>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Label className="grid gap-1 text-xs text-muted-foreground">
              From line
              <Input
                type="number"
                min={1}
                max={maxLine}
                value={form.lineStart}
                onChange={(event) => onChange({ ...form, lineStart: positiveInput(event.currentTarget.value), selectedText: "" })}
              />
            </Label>
            <Label className="grid gap-1 text-xs text-muted-foreground">
              To line
              <Input
                type="number"
                min={1}
                max={maxLine}
                value={form.lineEnd}
                onChange={(event) => onChange({ ...form, lineEnd: positiveInput(event.currentTarget.value), selectedText: "" })}
              />
            </Label>
          </div>
        </details>
        {form.selectedText ? (
          <div className="rounded-md border bg-background/70 px-2.5 py-2 font-mono text-[11px] leading-4 text-muted-foreground">
            <div className="mb-1 font-sans text-[10px] font-medium uppercase tracking-wider">Selected excerpt</div>
            <div className="line-clamp-4 whitespace-pre-wrap">{form.selectedText}</div>
          </div>
        ) : null}
        <div className="grid gap-2">
          <SegmentedField
            label="Severity"
            value={form.severity}
            options={severities}
            onChange={(severity) => onChange({ ...form, severity })}
          />
          <SegmentedField
            label="Type"
            value={form.kind}
            options={kinds}
            onChange={(kind) => onChange({ ...form, kind })}
          />
        </div>
        <Label className="grid gap-1.5 text-xs font-medium">
          Feedback
          <Textarea
            rows={4}
            required
            placeholder="State the problem, decision, or question clearly."
            value={form.note}
            onChange={(event) => onChange({ ...form, note: event.currentTarget.value })}
          />
        </Label>
        <Label className="grid gap-1.5 text-xs font-medium">
          Agent action <span className="font-normal text-muted-foreground">(optional)</span>
          <Textarea
            rows={2}
            placeholder="Give a specific change when the feedback alone is not enough."
            value={form.agentAction}
            onChange={(event) => onChange({ ...form, agentAction: event.currentTarget.value })}
          />
        </Label>
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onReset}>
            <RotateCcw />
            Clear
          </Button>
          <Button type="submit" size="sm" disabled={saving || form.lineStart > maxLine || form.lineEnd > maxLine || form.lineEnd < form.lineStart}>
            <Save />
            {form.id ? "Update note" : "Add note"}
          </Button>
        </div>
        <input type="hidden" value={selection.lineStart} readOnly />
      </form>
    </section>
  )
}

function rangeText(start: number, end: number): string {
  return start === end ? `Line ${start}` : `Lines ${start}-${end}`
}

function SegmentedField<T extends AnnotationSeverity | AnnotationKind>({
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
      <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-md border bg-background/70 p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            className={cn(
              "h-6 min-w-14 rounded px-2 text-xs text-muted-foreground",
              option.value === value && "bg-accent text-accent-foreground",
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

export function resetForm(selection: SelectionRange): AnnotationFormValue {
  return emptyForm(selection)
}
