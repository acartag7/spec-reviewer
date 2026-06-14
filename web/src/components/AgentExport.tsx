import { Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface AgentExportProps {
  markdown: string
  loading: boolean
  onCopy: () => void
}

export function AgentExport({ markdown, loading, onCopy }: AgentExportProps) {
  return (
    <section className="grid gap-3">
      <div className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">Agent Export</div>
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
