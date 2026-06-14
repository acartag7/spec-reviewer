import DOMPurify from "dompurify"
import { marked } from "marked"
import type { MarkdownBlock, SourceAnchor } from "@/lib/markdown-provenance"

export function renderMarkdownBlockHtml(block: MarkdownBlock): string {
  const dirty = marked.parse(block.raw, { async: false, gfm: true, breaks: false }) as string
  const clean = DOMPurify.sanitize(dirty, { USE_PROFILES: { html: true } })
  const template = document.createElement("template")
  template.innerHTML = clean
  applyListAnchors(template.content, block.anchors.filter((anchor) => anchor.kind === "list-item"))
  applyCodeLineAnchors(template.content, block.anchors.filter((anchor) => anchor.kind === "code-line"))
  return template.innerHTML
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
