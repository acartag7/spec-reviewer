import { Copy } from "lucide-react"
import type { Annotation } from "@/api/types"
import { Button } from "@/components/ui/button"
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
      <div>
        <div className="text-sm font-semibold">Agent handoff</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Copy the exact Markdown that will be returned to the waiting agent.</p>
      </div>
      {drift.total > 0 ? (
        <div role="alert" className="rounded-lg border border-sev-major/35 bg-sev-major/10 px-3 py-2 text-sm">
          Review anchors before copying export: {anchorDriftText(drift)}.
        </div>
      ) : null}
      <pre className="review-scroll max-h-[calc(100dvh-15rem)] min-h-72 overflow-auto whitespace-pre-wrap rounded-xl border bg-muted/40 p-4 font-mono text-xs leading-5 text-foreground">
        {loading ? "Loading export..." : markdown}
      </pre>
      <div className="flex justify-end">
        <Button type="button" onClick={onCopy} disabled={loading}>
          <Copy />
          Copy
        </Button>
      </div>
    </section>
  )
}
