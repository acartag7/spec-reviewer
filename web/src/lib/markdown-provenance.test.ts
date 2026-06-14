import { expect, test } from "vitest"
import { buildMarkdownBlocks } from "@/lib/markdown-provenance"
import { renderMarkdownBlockHtml } from "@/lib/markdown-html"

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

test("renderMarkdownBlockHtml sanitizes raw markdown HTML", () => {
  const [block] = buildMarkdownBlocks('<img src="x" onerror="alert(1)">')
  if (block == null) throw new Error("fixture block missing")

  const host = htmlHost(renderMarkdownBlockHtml(block).html)

  expect(host.innerHTML).not.toContain("onerror")
  expect(host.querySelector("img")?.getAttribute("src")).toBe("x")
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

function htmlHost(html: string): HTMLElement {
  const host = document.createElement("div")
  host.innerHTML = html
  return host
}
