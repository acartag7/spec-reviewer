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

  const listHost = htmlHost(renderMarkdownBlockHtml(list))
  const codeHost = htmlHost(renderMarkdownBlockHtml(code))

  expect(Array.from(listHost.querySelectorAll<HTMLElement>("li")).map((item) => item.dataset.sourceLine))
    .toEqual(["9", "10", "11"])
  expect(Array.from(codeHost.querySelectorAll<HTMLElement>("pre code span")).map((item) => item.dataset.sourceLine))
    .toEqual(["16", "17", "18", "19"])
})

test("renderMarkdownBlockHtml sanitizes raw markdown HTML", () => {
  const [block] = buildMarkdownBlocks('<img src="x" onerror="alert(1)">')
  if (block == null) throw new Error("fixture block missing")

  const host = htmlHost(renderMarkdownBlockHtml(block))

  expect(host.innerHTML).not.toContain("onerror")
  expect(host.querySelector("img")?.getAttribute("src")).toBe("x")
})

function htmlHost(html: string): HTMLElement {
  const host = document.createElement("div")
  host.innerHTML = html
  return host
}
