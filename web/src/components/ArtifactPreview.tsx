import { useState } from "react"
import { Code2, Eye, ShieldCheck } from "lucide-react"
import type { ArtifactHtml } from "@/lib/markdown-html"
import { Button } from "@/components/ui/button"

interface ArtifactPreviewProps {
  artifact: ArtifactHtml
}

export function ArtifactPreview({ artifact }: ArtifactPreviewProps) {
  const [mode, setMode] = useState<"source" | "preview">("source")
  const [rendered, setRendered] = useState(false)
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:14px system-ui,sans-serif;color:#171717}svg{max-width:100%;height:auto}</style></head><body>${artifact.html}</body></html>`

  return (
    <div className="artifact-preview">
      <div className="artifact-toolbar">
        <div className="artifact-title">
          <ShieldCheck className="size-4" />
          {artifact.kind.toUpperCase()} artifact
        </div>
        <div className="flex gap-1">
          <Button type="button" size="sm" variant={mode === "source" ? "secondary" : "ghost"} onClick={(event) => {
            event.stopPropagation()
            setMode("source")
          }}>
            <Code2 />
            Source
          </Button>
          <Button type="button" size="sm" variant={mode === "preview" ? "secondary" : "ghost"} onClick={(event) => {
            event.stopPropagation()
            setMode("preview")
          }}>
            <Eye />
            Preview
          </Button>
        </div>
      </div>
      {mode === "source" ? (
        <pre className="artifact-source"><code>{artifact.source}</code></pre>
      ) : rendered ? (
        <iframe title={`${artifact.kind} artifact preview`} srcDoc={srcDoc} sandbox="" className="artifact-frame" />
      ) : (
        <button type="button" className="artifact-gate" onClick={(event) => {
          event.stopPropagation()
          setRendered(true)
        }}>
          <ShieldCheck className="size-4" />
          Render sandboxed preview
        </button>
      )}
    </div>
  )
}
