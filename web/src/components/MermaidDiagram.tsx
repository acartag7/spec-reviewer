import { useEffect, useState } from "react"
import { sanitizeMermaidSvg } from "@/lib/markdown-html"

type MermaidClient = (typeof import("mermaid"))["default"]
type RenderState = { kind: "loading" } | { kind: "ready"; svg: string } | { kind: "error" }

let nextDiagramId = 0
let mermaidClient: Promise<MermaidClient> | null = null

export function MermaidDiagram({ source }: { source: string }) {
  const [id] = useState(() => `spec-reviewer-mermaid-${nextDiagramId += 1}`)
  const [state, setState] = useState<RenderState>({ kind: "loading" })

  useEffect(() => {
    let active = true
    setState({ kind: "loading" })
    void renderDiagram(id, source).then(
      (svg) => { if (active) setState({ kind: "ready", svg }) },
      () => { if (active) setState({ kind: "error" }) },
    )
    return () => { active = false }
  }, [source])

  if (state.kind === "error") {
    return (
      <figure className="mermaid-diagram mermaid-diagram-error">
        <figcaption role="alert">This Mermaid diagram could not be rendered. Its source is shown below.</figcaption>
        <pre><code>{source}</code></pre>
      </figure>
    )
  }

  if (state.kind === "loading") return <div className="mermaid-diagram mermaid-diagram-loading">Rendering diagram…</div>

  return <figure aria-label="Mermaid diagram" className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: state.svg }} />
}

async function renderDiagram(id: string, source: string): Promise<string> {
  const mermaid = await getMermaid()
  const { svg } = await mermaid.render(id, source)
  return sanitizeMermaidSvg(svg)
}

function getMermaid(): Promise<MermaidClient> {
  if (mermaidClient == null) {
    mermaidClient = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        htmlLabels: false,
        maxTextSize: 50_000,
        maxEdges: 1_000,
        secure: ["securityLevel", "startOnLoad", "htmlLabels", "maxTextSize", "maxEdges"],
      })
      return mermaid
    })
  }
  return mermaidClient
}
