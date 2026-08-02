import { RotateCcw, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface ReviewSummaryProps {
  value: string
  dirty: boolean
  saving: boolean
  onChange: (value: string) => void
  onRevert: () => void
  onSave: () => void
}

export function ReviewSummary({ value, dirty, saving, onChange, onRevert, onSave }: ReviewSummaryProps) {
  const bytes = new TextEncoder().encode(value).byteLength
  const tooLarge = bytes > 64 * 1024
  return (
    <section aria-labelledby="review-summary-heading" className="grid gap-2 border-b pb-3">
      <div>
        <h3 id="review-summary-heading" className="text-xs font-medium">Overall assessment</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Optional context before line-level feedback.</p>
      </div>
      <Label className="sr-only" htmlFor="review-summary">Overall assessment</Label>
      <Textarea
        id="review-summary"
        rows={3}
        value={value}
        placeholder="Summarize the decision or overall direction."
        aria-invalid={tooLarge}
        aria-describedby={tooLarge ? "review-summary-limit" : undefined}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {tooLarge ? <p id="review-summary-limit" role="alert" className="text-[11px] text-destructive">Summary is {bytes.toLocaleString()} bytes; the limit is 65,536.</p> : null}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-muted-foreground">{dirty ? "Unsaved changes" : "Saved"}</span>
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="ghost" disabled={!dirty || saving} onClick={onRevert}>
            <RotateCcw /> Revert
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={!dirty || saving || tooLarge} onClick={onSave}>
            <Save /> Save summary
          </Button>
        </div>
      </div>
    </section>
  )
}
