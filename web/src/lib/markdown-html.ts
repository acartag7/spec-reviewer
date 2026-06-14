import DOMPurify from "dompurify"
import { marked } from "marked"
import type { MarkdownBlock, SourceAnchor } from "@/lib/markdown-provenance"

export interface RenderedBlockHtml {
  html: string
  artifact: ArtifactHtml | null
}

export interface ArtifactHtml {
  kind: "html" | "svg"
  html: string
  source: string
}

export function renderMarkdownBlockHtml(block: MarkdownBlock): RenderedBlockHtml {
  if (block.artifact != null) {
    return {
      html: "",
      artifact: {
        kind: block.artifact.kind,
        html: sanitizeArtifact(block.artifact.source, block.artifact.kind),
        source: block.artifact.source,
      },
    }
  }
  const rawArtifact = rawArtifactFromBlock(block.raw)
  if (rawArtifact != null) return { html: "", artifact: rawArtifact }
  const dirty = marked.parse(block.raw, { async: false, gfm: true, breaks: false }) as string
  const clean = DOMPurify.sanitize(dirty, { USE_PROFILES: { html: true } })
  const template = document.createElement("template")
  template.innerHTML = clean
  applyListAnchors(template.content, block.anchors.filter((anchor) => anchor.kind === "list-item"))
  applyCodeLineAnchors(template.content, block.anchors.filter((anchor) => anchor.kind === "code-line"))
  return { html: template.innerHTML, artifact: null }
}

function applyListAnchors(root: DocumentFragment, anchors: SourceAnchor[]) {
  const items = Array.from(root.querySelectorAll("li"))
  anchors.forEach((anchor, index) => {
    const item = items[index]
    if (item != null) setSourceAnchor(item, anchor)
  })
}

function applyCodeLineAnchors(root: DocumentFragment, anchors: SourceAnchor[]) {
  const code = root.querySelector("pre > code")
  if (code == null || anchors.length === 0) return
  const lines = (code.textContent ?? "").replace(/\n$/, "").split("\n")
  code.textContent = ""
  lines.forEach((line, index) => {
    const anchor = anchors[index]
    const span = document.createElement("span")
    span.textContent = line
    if (anchor != null) setSourceAnchor(span, anchor)
    code.append(span)
    if (index < lines.length - 1) code.append(document.createTextNode("\n"))
  })
}

function setSourceAnchor(element: HTMLElement, anchor: SourceAnchor) {
  element.dataset.sourceLine = String(anchor.lineStart)
  element.dataset.sourceEndLine = String(anchor.lineEnd)
}

function sanitizeArtifact(source: string, kind: ArtifactHtml["kind"]): string {
  if (kind === "svg") {
    return DOMPurify.sanitize(source, { USE_PROFILES: { svg: true, svgFilters: true } })
  }
  return DOMPurify.sanitize(source, { USE_PROFILES: { html: true } })
}

function rawArtifactFromBlock(raw: string): ArtifactHtml | null {
  const source = raw.trim()
  if (!source.startsWith("<")) return null
  if (/^<svg(?:\s|>)/i.test(source)) return artifactFromSource(source, "svg")
  const artifact = artifactFromSource(source, "html")
  return artifact != null && hasHtmlArtifactHint(artifact.html) ? artifact : null
}

function artifactFromSource(source: string, kind: ArtifactHtml["kind"]): ArtifactHtml | null {
  const html = sanitizeArtifact(source, kind)
  const template = document.createElement("template")
  template.innerHTML = html
  const children = Array.from(template.content.children)
  const element = children[0]
  if (children.length !== 1) return null
  if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) return null
  if (element.tagName.toLowerCase() === "iframe") return null
  if (kind === "svg" && element.tagName.toLowerCase() !== "svg") return null
  return { kind, html: template.innerHTML, source }
}

function hasHtmlArtifactHint(html: string): boolean {
  const template = document.createElement("template")
  template.innerHTML = html
  const element = template.content.firstElementChild
  if (element == null || template.content.children.length !== 1) return false
  const role = element.getAttribute("role")
  const className = element.getAttribute("class") ?? ""
  return element.hasAttribute("data-artifact")
    || role === "img"
    || /\b(artifact|preview|mockup|diagram|wireframe)\b/i.test(className)
}
