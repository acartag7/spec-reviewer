import { marked } from "marked"
import type { ReviewDocument } from "@/api/types"

interface MarkdownToken {
  type: string
  raw: string
  items?: Array<{ raw: string }>
  text?: string
}

export interface SourceAnchor {
  kind: "list-item" | "code-line"
  lineStart: number
  lineEnd: number
}

export interface MarkdownBlock {
  id: string
  raw: string
  startLine: number
  endLine: number
  anchors: SourceAnchor[]
}

export function sourceFromLines(lines: ReviewDocument["lines"]): string {
  return lines.map((line) => line.text).join("\n")
}

export function sourceTextForRange(lines: ReviewDocument["lines"], start: number, end: number): string {
  return lines
    .filter((line) => line.number >= start && line.number <= end)
    .map((line) => line.text)
    .join("\n")
    .trim()
}

export function buildMarkdownBlocks(source: string): MarkdownBlock[] {
  const tokens = marked.lexer(source, { gfm: true, breaks: false }) as MarkdownToken[]
  const lineStarts = buildLineStarts(source)
  const lineOf = (offset: number) => lineForOffset(lineStarts, offset)
  const blocks: MarkdownBlock[] = []
  let offset = 0

  for (const token of tokens) {
    const startOffset = offset
    const endOffset = offset + token.raw.length
    offset = endOffset
    if (token.type === "space" || token.raw.length === 0) continue

    const last = lastContentOffset(source, startOffset, endOffset)
    const startLine = lineOf(startOffset)
    const endLine = lineOf(last)
    blocks.push({
      id: `${startLine}-${endLine}-${blocks.length}`,
      raw: token.raw,
      startLine,
      endLine,
      anchors: anchorsForToken(token, source, startOffset, startLine, lineOf),
    })
  }

  return blocks
}

function buildLineStarts(source: string): number[] {
  const starts = [0]
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") starts.push(index + 1)
  }
  return starts
}

function lineForOffset(lineStarts: number[], offset: number): number {
  let low = 0
  let high = lineStarts.length - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    const start = lineStarts[middle] ?? 0
    if (start <= offset) low = middle
    else high = middle - 1
  }
  return low + 1
}

function lastContentOffset(source: string, start: number, end: number): number {
  let last = Math.max(start, end - 1)
  while (last > start && /\s/.test(source[last] ?? "")) last -= 1
  return last
}

function anchorsForToken(
  token: MarkdownToken,
  source: string,
  startOffset: number,
  startLine: number,
  lineOf: (offset: number) => number,
): SourceAnchor[] {
  if (token.type === "list") return listItemAnchors(token, source, startOffset, lineOf)
  if (token.type === "code") return codeLineAnchors(token, startLine)
  return []
}

function listItemAnchors(
  token: MarkdownToken,
  source: string,
  startOffset: number,
  lineOf: (offset: number) => number,
): SourceAnchor[] {
  const anchors: SourceAnchor[] = []
  let cursor = 0
  for (const item of token.items ?? []) {
    const index = token.raw.indexOf(item.raw, cursor)
    if (index < 0) continue
    const itemStart = startOffset + index
    const itemEnd = itemStart + item.raw.length
    anchors.push({
      kind: "list-item",
      lineStart: lineOf(itemStart),
      lineEnd: lineOf(lastContentOffset(source, itemStart, itemEnd)),
    })
    cursor = index + item.raw.length
  }
  return anchors
}

function codeLineAnchors(token: MarkdownToken, startLine: number): SourceAnchor[] {
  const contentStart = /^\s*(```|~~~)/.test(token.raw) ? startLine + 1 : startLine
  const lines = (token.text ?? "").replace(/\n$/, "").split("\n")
  if (lines.length === 1 && lines[0] === "") return []
  return lines.map((_, index) => ({
    kind: "code-line",
    lineStart: contentStart + index,
    lineEnd: contentStart + index,
  }))
}
