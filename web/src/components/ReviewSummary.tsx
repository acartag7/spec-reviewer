import { Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface ReviewSummaryProps {
  value: string
  dirty: boolean
  saving: boolean
  onChange: (value: string) => void
  onSave: () => void
}

export function ReviewSummary({ value, dirty, saving, onChange, onSave }: ReviewSummaryProps) {
  return (
    <section className="grid gap-2 rounded-xl border bg-muted/25 p-3">
      <div>
        <div className="text-sm font-semibold">Overall assessment</div>
        <p className="mt-0.5 text-xs text-muted-foreground">Optional context placed before the line-level feedback.</p>
      </div>
      <Label className="sr-only" htmlFor="review-summary">Overall assessment</Label>
      <Textarea
        id="review-summary"
        rows={3}
        value={value}
        placeholder="Summarize the decision or overall direction."
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{dirty ? "Unsaved changes" : "Saved"}</span>
        <Button type="button" size="sm" variant="outline" disabled={!dirty || saving} onClick={onSave}>
          <Save /> Save summary
        </Button>
      </div>
    </section>
  )
}
