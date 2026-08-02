import { expect, test } from "vitest"
import type { Annotation } from "@/api/types"
import { createAnnotation, formFromAnnotation, hasAnnotationDraft } from "@/lib/review-utils"

test("editing an annotation preserves its lifecycle and agent action", () => {
  const annotation: Annotation = {
    id: "resolved-note",
    lineStart: 4,
    lineEnd: 4,
    section: "Spec",
    selectedText: "unverified legacy quote",
    kind: "issue",
    severity: "major",
    status: "resolved",
    note: "Keep the rationale",
    agentAction: "Retain this exact action",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    anchor: { state: "ok", lineStart: 4, lineEnd: 4, sourceText: "verified source" },
  }
  const form = formFromAnnotation(annotation)
  const rebuilt = createAnnotation(form, {
    lineStart: 1,
    lineEnd: 1,
    selectedText: "wrong selection",
  })
  expect(rebuilt.status).toBe("resolved")
  expect(rebuilt.agentAction).toBe("Retain this exact action")
  expect(rebuilt.lineStart).toBe(4)
  expect(form.selectedText).toBe("verified source")
  expect(rebuilt.selectedText).toBeNull()
})

test("padded stored text is unchanged until its content changes", () => {
  const annotation: Annotation = {
    id: "padded-note",
    lineStart: 1,
    lineEnd: 1,
    section: null,
    selectedText: null,
    kind: "issue",
    severity: "major",
    status: "open",
    note: "  Keep this note  ",
    agentAction: "  Keep this action  ",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
  const form = formFromAnnotation(annotation)
  expect(hasAnnotationDraft(form, [annotation])).toBe(false)
  expect(hasAnnotationDraft({ ...form, agentAction: "Different action" }, [annotation])).toBe(true)
})
