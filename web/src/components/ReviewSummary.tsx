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
    <section className="grid gap-2 border-b pb-3">
      <div>
        <div className="text-xs font-medium">Overall assessment</div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Optional context before line-level feedback.</p>
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
        <span className="text-[11px] text-muted-foreground">{dirty ? "Unsaved changes" : "Saved"}</span>
        <Button type="button" size="sm" variant="outline" disabled={!dirty || saving} onClick={onSave}>
          <Save /> Save summary
        </Button>
      </div>
    </section>
  )
}
