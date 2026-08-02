import { afterEach, expect, test } from "vitest"
import type { ReviewDocument } from "@/api/types"
import { selectionFromWindow } from "@/lib/selection-utils"

afterEach(() => {
  window.getSelection()?.removeAllRanges()
  document.body.replaceChildren()
})

test("browser selection preserves the exact phrase instead of replacing it with the source line", () => {
  const host = selectionHost("prefix precise phrase suffix")
  const text = host.querySelector("span")?.firstChild
  if (!(text instanceof Text)) throw new Error("selection text missing")
  const range = document.createRange()
  range.setStart(text, 7)
  range.setEnd(text, 14)
  selectRange(range)

  expect(selectionFromWindow(host, lines)).toEqual({
    lineStart: 1,
    lineEnd: 1,
    selectedText: "precise",
  })
})

test("browser selection excludes generated change labels without dropping document text", () => {
  const host = selectionHost('<span data-selection-ignore="true">Changed</span><span>café 漢字 👩‍💻</span>')
  const row = host.firstElementChild
  if (row == null) throw new Error("selection row missing")
  const range = document.createRange()
  range.selectNodeContents(row)
  selectRange(range)

  expect(selectionFromWindow(host, lines)).toEqual({
    lineStart: 1,
    lineEnd: 1,
    selectedText: "café 漢字 👩‍💻",
  })
})

const lines: ReviewDocument["lines"] = [
  { number: 1, text: "the complete source line", kind: "normal", sectionTitle: null },
]

function selectionHost(content: string): HTMLElement {
  const host = document.createElement("div")
  host.innerHTML = `<div data-source-line="1"><span>${content}</span></div>`
  document.body.append(host)
  return host
}

function selectRange(range: Range) {
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}
