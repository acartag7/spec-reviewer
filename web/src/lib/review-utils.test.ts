import { expect, test } from "vitest"
import type { Annotation } from "@/api/types"
import { clearSubmittedForm, createAnnotation, emptyForm, formFromAnnotation } from "@/lib/review-utils"

test("editing a resolved annotation preserves status and agent action", () => {
  const annotation: Annotation = {
    id: "a1",
    lineStart: 2,
    lineEnd: 2,
    section: "Demo",
    selectedText: "Target",
    kind: "issue",
    severity: "major",
    status: "resolved",
    note: "Tighten this",
    agentAction: "Name the exact invariant.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
  const form = formFromAnnotation(annotation)
  const rebuilt = createAnnotation(form, { lineStart: 1, lineEnd: 1, selectedText: "" })

  expect(rebuilt.status).toBe("resolved")
  expect(rebuilt.agentAction).toBe("Name the exact invariant.")
})

test("manual range changes do not reuse selected text from the old selection", () => {
  const selection = { lineStart: 2, lineEnd: 2, selectedText: "Old selected text" }
  const form = { ...emptyForm(selection), lineStart: 5, lineEnd: 5, selectedText: "", note: "Check line five" }

  expect(createAnnotation(form, selection).selectedText).toBeNull()
})

test("a completed note mutation clears only the unchanged submitted form", () => {
  const selection = { lineStart: 3, lineEnd: 3, selectedText: "Current" }
  const submitted = { ...emptyForm(selection), id: "ann_1", note: "Editing" }
  const switched = { ...submitted, id: "ann_2", note: "Different note" }
  const revised = { ...submitted, note: "Newer edit" }

  expect(clearSubmittedForm(submitted, submitted, selection)).toEqual(emptyForm(selection))
  expect(clearSubmittedForm(switched, submitted, selection)).toBe(switched)
  expect(clearSubmittedForm(revised, submitted, selection)).toBe(revised)
})
