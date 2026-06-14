import { RotateCcw, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type { AnnotationKind, AnnotationSeverity, SelectionRange } from "@/api/types"
import { emptyForm, kinds, severities, type AnnotationFormValue } from "@/lib/review-utils"

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
              type="number"
              min={1}
              value={form.lineStart}
              onChange={(event) => onChange({ ...form, lineStart: positiveInput(event.currentTarget.value) })}
            />
          </Label>
          <Label className="grid gap-1 text-xs text-muted-foreground">
            To
            <Input
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
        <Label className="grid gap-1 text-xs text-muted-foreground">
          Selected text
          <Textarea
            rows={2}
            value={form.selectedText}
            className="max-h-44 min-h-16 font-mono text-xs"
            onChange={(event) => onChange({ ...form, selectedText: event.currentTarget.value })}
          />
        </Label>
        <Label className="grid gap-1 text-xs text-muted-foreground">
          Feedback
          <Textarea
            rows={5}
            required
            value={form.note}
            onChange={(event) => onChange({ ...form, note: event.currentTarget.value })}
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
        <input type="hidden" value={selection.lineStart} readOnly />
      </form>
    </section>
  )
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
      <Tabs value={value} onValueChange={(next) => onChange(next as T)}>
        <TabsList aria-label={label} className="h-auto flex-wrap justify-start">
          {options.map((option) => (
            <TabsTrigger key={option.value} value={option.value} className="min-w-16">
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
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
