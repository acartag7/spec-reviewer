import { Copy } from "lucide-react"
import type { Annotation } from "@/api/types"
import { Button } from "@/components/ui/button"
import { anchorDriftSummary, anchorDriftText } from "@/lib/review-utils"

interface AgentExportProps {
  markdown: string
  loading: boolean
  disabled?: boolean
  annotations: Annotation[]
  onCopy: () => void
}

export function AgentExport({ markdown, loading, disabled = false, annotations, onCopy }: AgentExportProps) {
  const drift = anchorDriftSummary(annotations)

  return (
    <section aria-labelledby="agent-export-heading" className="grid gap-3">
      <div>
        <h3 id="agent-export-heading" className="text-xs font-medium">Agent handoff</h3>
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Handoff saves an immutable comparison checkpoint before copying this Markdown.</p>
      </div>
      {drift.total > 0 ? (
        <div role="alert" className="border-l-2 border-sev-major bg-sev-major/10 px-3 py-2 text-sm">
          Review anchors before copying export: {anchorDriftText(drift)}.
        </div>
      ) : null}
      <pre role="region" tabIndex={0} aria-label="Agent export Markdown" className="review-scroll max-h-[calc(100dvh-13rem)] min-h-72 overflow-auto whitespace-pre-wrap border bg-background/75 p-3 font-mono text-[11px] leading-5 text-foreground">
        {loading ? "Loading export..." : markdown}
      </pre>
      <div className="flex justify-end">
        <Button type="button" onClick={onCopy} disabled={loading || disabled}>
          <Copy />
          Handoff & copy
        </Button>
      </div>
    </section>
  )
}
