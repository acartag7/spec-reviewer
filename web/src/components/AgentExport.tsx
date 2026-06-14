import { Copy } from "lucide-react"
import type { Annotation } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { anchorDriftSummary, anchorDriftText } from "@/lib/review-utils"

interface AgentExportProps {
  markdown: string
  loading: boolean
  annotations: Annotation[]
  onCopy: () => void
}

export function AgentExport({ markdown, loading, annotations, onCopy }: AgentExportProps) {
  const drift = anchorDriftSummary(annotations)

  return (
    <section className="grid gap-3">
      <div className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">Agent Export</div>
      {drift.total > 0 ? (
        <div role="alert" className="rounded-lg border border-sev-major/35 bg-sev-major/10 px-3 py-2 text-sm">
          Review anchors before copying export: {anchorDriftText(drift)}.
        </div>
      ) : null}
      <Textarea
        rows={12}
        readOnly
        value={loading ? "Loading export..." : markdown}
        className="min-h-64 resize-y font-mono text-xs leading-5"
      />
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={onCopy}>
          <Copy />
          Copy
        </Button>
      </div>
    </section>
  )
}
