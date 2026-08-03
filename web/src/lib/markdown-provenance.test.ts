import { expect, test } from "vitest"
import { buildMarkdownBlocks, sourceTextForRange } from "@/lib/markdown-provenance"
import { renderMarkdownBlockHtml, sanitizeMermaidSvg } from "@/lib/markdown-html"
import { selectionFromElement } from "@/lib/selection-utils"

const source = [
  "# Workflow Gates",
  "",
  "Runtime enforcement for agent tool calls.",
  "",
  "## Enforcement model",
  "",
  "Every gate evaluates a call.",
  "",
  "- read-before-edit",
  "- verify-before-push",
  "- approval-before-merge",
  "",
  "> Gates enforce process, not quality.",
  "",
  "```ts",
  "gate('verify-before-push', {",
  "  requires: ['evidence:test-run'],",
  "  onViolation: 'block',",
  "});",
  "```",
].join("\n")

test("buildMarkdownBlocks maps top-level markdown ranges to source lines", () => {
  const blocks = buildMarkdownBlocks(source)

  expect(blocks[0]).toMatchObject({ startLine: 1, endLine: 1 })
  expect(blocks.find((block) => block.startLine === 9)).toMatchObject({ startLine: 9, endLine: 11 })
  expect(blocks.find((block) => block.startLine === 13)).toMatchObject({ startLine: 13, endLine: 13 })
  expect(blocks.find((block) => block.startLine === 15)).toMatchObject({ startLine: 15, endLine: 20 })
})

test("sourceTextForRange preserves indentation, blank lines, and trailing spaces", () => {
  const lines = [
    { number: 1, text: "  indented  ", kind: "normal" as const, sectionTitle: null },
    { number: 2, text: "", kind: "blank" as const, sectionTitle: null },
  ]

  expect(sourceTextForRange(lines, 1, 2)).toBe("  indented  \n")
})

test("renderMarkdownBlockHtml adds finer list and code source anchors", () => {
  const blocks = buildMarkdownBlocks(source)
  const list = blocks.find((block) => block.startLine === 9)
  const code = blocks.find((block) => block.startLine === 15)
  if (list == null || code == null) throw new Error("fixture blocks missing")

  const listHost = htmlHost(renderMarkdownBlockHtml(list).html)
  const codeHost = htmlHost(renderMarkdownBlockHtml(code).html)

  expect(Array.from(listHost.querySelectorAll<HTMLElement>("li")).map((item) => item.dataset.sourceLine))
    .toEqual(["9", "10", "11"])
  expect(Array.from(codeHost.querySelectorAll<HTMLElement>("pre code span")).map((item) => item.dataset.sourceLine))
    .toEqual(["16", "17", "18", "19"])
})

test("buildMarkdownBlocks identifies fenced Mermaid diagrams without treating them as artifacts", () => {
  const [block] = buildMarkdownBlocks("```mermaid\nflowchart TD\n  A --> B\n```")
  if (block == null) throw new Error("fixture block missing")

  expect(block).toMatchObject({
    startLine: 1,
    endLine: 4,
    artifact: null,
    mermaid: { source: "flowchart TD\n  A --> B" },
  })
})

test("renderMarkdownBlockHtml wraps Markdown tables for responsive scrolling", () => {
  const [block] = buildMarkdownBlocks("| Owner | Status |\n| --- | --- |\n| Arnold | In progress |")
  if (block == null) throw new Error("fixture block missing")

  const host = htmlHost(renderMarkdownBlockHtml(block).html)

  expect(host.querySelector(".markdown-table-wrap > table")).not.toBeNull()
})

test("rendered change markers stay on the exact list item instead of the whole list", () => {
  const list = buildMarkdownBlocks(source).find((block) => block.startLine === 9)
  if (list == null) throw new Error("fixture list missing")

  const host = htmlHost(renderMarkdownBlockHtml(list, new Set([10])).html)
  const items = Array.from(host.querySelectorAll<HTMLElement>("li"))

  expect(items.map((item) => item.dataset.change ?? null)).toEqual([null, "current", null])
  expect(host.querySelector("ol, ul")?.hasAttribute("data-change")).toBe(false)
})

test("renderMarkdownBlockHtml sanitizes raw markdown HTML", () => {
  const [block] = buildMarkdownBlocks('<img src="x" onerror="alert(1)">')
  if (block == null) throw new Error("fixture block missing")

  const host = htmlHost(renderMarkdownBlockHtml(block).html)

  expect(host.innerHTML).not.toContain("onerror")
  expect(host.querySelector("img")?.getAttribute("src")).toBe("x")
})

test("document HTML cannot forge provenance or shift an outer list item anchor", () => {
  const forged = [
    '<span data-source-line="1" data-source-end-line="999" data-change="current" data-selection-ignore="true">forged</span>',
    "",
    "- real item",
    "  <ul><li data-source-line=\"1\">raw item</li></ul>",
  ].join("\n")
  const blocks = buildMarkdownBlocks(forged)
  const rendered = blocks.map((block) => renderMarkdownBlockHtml(block, new Set([1, 3])))
  const html = rendered.map((block) => block.html).join("")
  const host = htmlHost(html)

  const items = Array.from(host.querySelectorAll<HTMLElement>("li"))
  const forgedSpan = Array.from(host.querySelectorAll<HTMLElement>("span")).find((span) => span.textContent === "forged")
  expect(host.querySelector("[data-source-end-line='999']")).toBeNull()
  expect(forgedSpan).not.toHaveAttribute("data-selection-ignore")
  expect(items[0]).toHaveAttribute("data-change", "current")
  expect(items[0]?.querySelector(".rendered-change-label")).toHaveTextContent("Changed")
  expect(items[1]).not.toHaveAttribute("data-source-line")
  expect(rendered.flatMap((block) => block.markedChangedLines)).toEqual([3])
})

test("nested list changes mark the smallest outer item range with provenance", () => {
  const [block] = buildMarkdownBlocks("- alpha\n  - nested\n- beta")
  if (block == null) throw new Error("fixture block missing")
  const rendered = renderMarkdownBlockHtml(block, new Set([2]))
  const host = htmlHost(rendered.html)
  const items = Array.from(host.querySelectorAll<HTMLElement>("li"))

  expect(items[0]).toHaveAttribute("data-source-line", "1")
  expect(items[0]).toHaveAttribute("data-source-end-line", "2")
  expect(items[0]).toHaveAttribute("data-change", "current")
  expect(items[0]?.querySelector(".rendered-change-label")).toHaveTextContent("Changed")
  expect(items[1]).not.toHaveAttribute("data-source-line")
  expect(items[2]).toHaveAttribute("data-source-line", "3")
  expect(rendered.markedChangedLines).toEqual([2])
})

test("changed code lines have a real textual marker", () => {
  const code = buildMarkdownBlocks(source).find((block) => block.startLine === 15)
  if (code == null) throw new Error("fixture code block missing")
  const rendered = renderMarkdownBlockHtml(code, new Set([17]))
  const host = htmlHost(rendered.html)
  const changed = host.querySelector<HTMLElement>("[data-source-line='17']")

  expect(changed).toHaveAttribute("data-change", "current")
  expect(changed?.querySelector(".rendered-change-label")).toHaveTextContent("Changed")
  expect(rendered.markedChangedLines).toEqual([17])
})

test("source selection rejects forged or reversed line ranges", () => {
  const host = htmlHost('<span data-source-line="99">past end</span><span data-source-line="2" data-source-end-line="1">reversed</span>')
  const lines = [
    { number: 1, text: "one", kind: "normal" as const, sectionTitle: null },
    { number: 2, text: "two", kind: "normal" as const, sectionTitle: null },
  ]

  expect(selectionFromElement(host.children[0]!, lines)).toBeNull()
  expect(selectionFromElement(host.children[1]!, lines)).toBeNull()
})

test("renderMarkdownBlockHtml identifies fenced SVG artifacts after sanitizing", () => {
  const [block] = buildMarkdownBlocks('```svg\n<svg><circle cx="4" cy="4" r="4" onload="alert(1)" /></svg>\n```')
  if (block == null) throw new Error("fixture block missing")

  const rendered = renderMarkdownBlockHtml(block)

  expect(rendered.artifact?.kind).toBe("svg")
  expect(rendered.artifact?.html).not.toContain("onload")
  expect(rendered.artifact?.source).toContain("<svg>")
})

test("renderMarkdownBlockHtml identifies raw SVG artifacts", () => {
  const [block] = buildMarkdownBlocks('<svg><circle cx="4" cy="4" r="4" onload="alert(1)" /></svg>')
  if (block == null) throw new Error("fixture block missing")

  const rendered = renderMarkdownBlockHtml(block)

  expect(rendered.artifact?.kind).toBe("svg")
  expect(rendered.artifact?.html).not.toContain("onload")
})

test("renderMarkdownBlockHtml identifies hinted HTML artifacts", () => {
  const [block] = buildMarkdownBlocks('<div data-artifact><button onclick="alert(1)">Run</button><script>alert(1)</script></div>')
  if (block == null) throw new Error("fixture block missing")

  const rendered = renderMarkdownBlockHtml(block)

  expect(rendered.artifact?.kind).toBe("html")
  expect(rendered.artifact?.html).toContain("<button>Run</button>")
  expect(rendered.artifact?.html).not.toContain("onclick")
  expect(rendered.artifact?.html).not.toContain("<script")
})

test("sanitizeMermaidSvg strips active SVG content", () => {
  const svg = sanitizeMermaidSvg('<svg><circle onclick="alert(1)" /><script>alert(1)</script></svg>')

  expect(svg).not.toContain("onclick")
  expect(svg).not.toContain("<script")
})

function htmlHost(html: string): HTMLElement {
  const host = document.createElement("div")
  host.innerHTML = html
  return host
}
