import { useEffect, useState } from "react"
import { MapPin, RotateCcw, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { AnnotationKind, AnnotationSeverity, SelectionRange } from "@/api/types"
import { kinds, severities, type AnnotationFormValue } from "@/lib/review-utils"
import { cn } from "@/lib/utils"

interface AnnotationPanelProps {
  form: AnnotationFormValue
  selection: SelectionRange
  maxLine: number
  allowStoredRange?: boolean
  saving: boolean
  onChange: (form: AnnotationFormValue) => void
  onSubmit: () => void
  onReset: () => void
}

export function AnnotationPanel({
  form,
  selection,
  maxLine,
  allowStoredRange = false,
  saving,
  onChange,
  onSubmit,
  onReset,
}: AnnotationPanelProps) {
  const rangeInvalid = maxLine < 1 || form.lineStart < 1 || form.lineEnd < 1 || form.lineStart > maxLine || form.lineEnd > maxLine || form.lineEnd < form.lineStart
  const rangeBlocked = rangeInvalid && !allowStoredRange
  const [rangeOpen, setRangeOpen] = useState(rangeInvalid)
  const [rangeTouched, setRangeTouched] = useState(false)
  const hasTarget = form.id !== "" || selection.lineStart > 0 || form.lineStart !== 1 || form.lineEnd !== 1 || rangeTouched
  const targetBlocked = !hasTarget
  const rangeMessage = rangeInvalid
    ? allowStoredRange
      ? "This saved range is outside the current document. Keep it to update the note, or choose current lines to re-anchor it."
      : maxLine < 1
        ? "This document has no source lines to annotate."
        : `Choose lines from 1 to ${maxLine}, with the ending line at or after the starting line.`
    : targetBlocked ? "Select source lines before adding feedback." : null
  const submitBlocked = rangeBlocked || targetBlocked
  useEffect(() => { if (rangeInvalid) setRangeOpen(true) }, [rangeInvalid])
  useEffect(() => setRangeTouched(false), [form.id, selection.lineEnd, selection.lineStart])
  return (
    <section aria-labelledby="annotation-panel-heading" className="grid gap-3">
      <h3 id="annotation-panel-heading" className="sr-only">Feedback annotation</h3>
      <div className="flex items-start gap-2 border-b pb-3">
        <MapPin className="mt-0.5 size-3.5 text-muted-foreground" />
        <div>
          <div className="text-xs font-medium">{hasTarget ? rangeText(form.lineStart, form.lineEnd) : "No source selected"}</div>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
            Select a passage, then describe what the agent should change.
          </p>
        </div>
      </div>
      {form.status === "resolved" ? (
        <div className="flex items-center justify-between gap-3 border-l-2 border-ok bg-accent/50 p-2.5 text-xs">
          <span>Resolved note</span>
          <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...form, status: "open" })}>
            <RotateCcw /> Mark open
          </Button>
        </div>
      ) : null}
      <form
        noValidate
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <details className="group" open={rangeOpen} onToggle={(event) => setRangeOpen(event.currentTarget.open)}>
          <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">Adjust source range</summary>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Label className="grid gap-1 text-xs text-muted-foreground">
              From line
              <Input
                name="lineStart"
                type="number"
                min={1}
                max={maxLine}
                aria-invalid={rangeInvalid}
                aria-describedby={rangeMessage == null ? undefined : "annotation-range-message"}
                value={form.lineStart}
                onInput={() => setRangeTouched(true)}
                onChange={(event) => onChange({ ...form, lineStart: positiveInput(event.currentTarget.value), selectedText: "" })}
              />
            </Label>
            <Label className="grid gap-1 text-xs text-muted-foreground">
              To line
              <Input
                name="lineEnd"
                type="number"
                min={1}
                max={maxLine}
                aria-invalid={rangeInvalid}
                aria-describedby={rangeMessage == null ? undefined : "annotation-range-message"}
                value={form.lineEnd}
                onInput={() => setRangeTouched(true)}
                onChange={(event) => onChange({ ...form, lineEnd: positiveInput(event.currentTarget.value), selectedText: "" })}
              />
            </Label>
          </div>
        </details>
        {rangeMessage != null ? (
          <p id="annotation-range-message" role="alert" className="border-l-2 border-sev-major bg-sev-major/10 px-2.5 py-2 text-[11px] leading-4">
            {rangeMessage}
          </p>
        ) : null}
        {form.selectedText ? (
          <div className="border-l-2 border-border bg-background/70 px-2.5 py-2 font-mono text-[11px] leading-4 text-muted-foreground">
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
            name="note"
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
            name="agentAction"
            rows={2}
            placeholder="Give a specific change when the feedback alone is not enough."
            value={form.agentAction}
            onChange={(event) => onChange({ ...form, agentAction: event.currentTarget.value })}
          />
        </Label>
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => { setRangeTouched(false); onReset() }}>
            <RotateCcw /> Clear
          </Button>
          <Button type="submit" size="sm" aria-describedby={rangeMessage == null ? undefined : "annotation-range-message"} disabled={saving || submitBlocked}>
            <Save /> {form.id ? "Update note" : "Add note"}
          </Button>
        </div>
        <input name="selectionLineStart" type="hidden" value={selection.lineStart} readOnly />
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
      <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-0.5 border bg-background/70 p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            className={cn(
              "h-6 min-w-14 rounded-sm px-2 text-xs text-muted-foreground",
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
